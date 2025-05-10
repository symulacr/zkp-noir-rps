import React, { useState, useEffect, useCallback } from 'react';
import { socketService } from './services/socketService';
import PlayerControl from './components/PlayerControl';
import GameDisplay from './components/GameDisplay';
import CommitModal from './components/CommitModal';
import './styles/App.css';
import { Socket } from "socket.io-client"; // for Socket.DisconnectReason

// define types for game state (mirroring backend)
interface PlayerState {
    id: string;
    move?: number;
    salt?: string;
    commitment?: string;
    hasCommitted: boolean;
    hasRevealed: boolean;
    proofVerified?: boolean;
}

interface GameState {
    players: { P1?: PlayerState; P2?: PlayerState };
    currentTurn: string;
    messageLog: string[];
    winner?: 'P1' | 'P2' | 'Draw';
    isProcessingZK: boolean;
}

const initialGameState: GameState = {
    players: {},
    currentTurn: 'CONNECTING',
    messageLog: ['Attempting to connect to server...'],
    isProcessingZK: false,
};

const MOVE_MAP: { [key: number]: string } = {
    0: 'Rock',
    1: 'Paper',
    2: 'Scissors'
};

function App() {
    const [gameState, setGameState] = useState<GameState>(initialGameState);
    const [assignedPlayerId, setAssignedPlayerId] = useState<'P1' | 'P2' | null>(null);

    const [p1InputMove, setP1InputMove] = useState<number | null>(null);
    const [p1InputSalt, setP1InputSalt] = useState<string>('');
    const [p2InputMove, setP2InputMove] = useState<number | null>(null);
    const [p2InputSalt, setP2InputSalt] = useState<string>('');
    
    const [showCommitModal, setShowCommitModal] = useState(false);
    const [modalData, setModalData] = useState<{playerId: 'P1'|'P2', commitment: string, move: number, salt: string} | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [connectionStatus, setConnectionStatus] = useState<'connected'|'disconnected'|'connecting'|'error'>('connecting');

    const handleConnect = useCallback(() => {
        setConnectionStatus('connected');
        console.log('[App.tsx] CB: Successfully connected. Socket ID:', socketService.socket.id);
    }, []);

    const handleDisconnect = useCallback((reason: Socket.DisconnectReason) => {
        setConnectionStatus('disconnected');
        console.warn('[App.tsx] CB: Disconnected. Reason:', reason);
        setAssignedPlayerId(null); 
    }, []);

    const handleConnectError = useCallback((err: Error) => {
        setConnectionStatus('error');
        console.error('[App.tsx] CB: Connection error:', err.message, err);
    }, []);

    const handlePlayerAssigned = useCallback((data: { playerId: 'P1' | 'P2' }) => {
        console.log('[App.tsx] CB: Player assigned:', data.playerId);
        setAssignedPlayerId(data.playerId);
    }, []);
    
    const handleGameStateUpdate = useCallback((data: { gameState: GameState; message?: string }) => {
        setGameState(data.gameState);
    }, []);

    const handleCommitmentGenerated = useCallback((data: { playerId: 'P1' | 'P2'; commitment: string; move: number; salt: string }) => {
        console.log(`[App.tsx] CB: Commitment generated for ${data.playerId}:`, data);
        setModalData(data);
        setShowCommitModal(true);
    }, []);

    const handleGameResult = useCallback((data: { winner?: 'P1' | 'P2' | 'Draw'; p1Move?: number; p2Move?: number; message: string }) => {
        console.log('[App.tsx] CB: Game Result:', data.message);
    }, []);

    const handleErrorMsg = useCallback((data: { message: string }) => {
        alert(`Server Error: ${data.message}`);
        console.error('[App.tsx] CB: Server Error Message:', data.message);
        setIsLoading(false);
    }, []);
    
    const handleLoadingUpdate = useCallback((data: { isLoading: boolean; message: string }) => {
        setIsLoading(data.isLoading);
        setLoadingMessage(data.message);
    }, []);

    const handleGameResetSignal = useCallback(() => {
        console.log("[App.tsx] CB: Game reset signal. Clearing states.");
        setP1InputMove(null);
        setP1InputSalt('');
        setP2InputMove(null);
        setP2InputSalt('');
        setAssignedPlayerId(null);
        setModalData(null);
        setShowCommitModal(false);
    }, []);

    useEffect(() => {
        const s = socketService.socket;

        if (s.connected) {
            handleConnect();
        } else {
            setConnectionStatus('connecting');
            console.log("[App.tsx] useEffect: Socket not connected. Relying on auto-connect or explicit connect call.");
            socketService.connect();
        }

        console.log("[App.tsx] useEffect: Setting up listeners.");
        s.on('connect', handleConnect);
        s.on('disconnect', handleDisconnect);
        s.on('connect_error', handleConnectError);

        socketService.on('player_assigned', handlePlayerAssigned);
        socketService.on('game_state_update', handleGameStateUpdate);
        socketService.on('commitment_generated', handleCommitmentGenerated);
        socketService.on('game_result', handleGameResult);
        socketService.on('error_message', handleErrorMsg);
        socketService.on('loading_update', handleLoadingUpdate);
        socketService.on('game_reset_signal', handleGameResetSignal);
        
        return () => {
            console.log("[App.tsx] useEffect cleanup: Removing listeners.");
            s.off('connect', handleConnect);
            s.off('disconnect', handleDisconnect);
            s.off('connect_error', handleConnectError);

            socketService.off('player_assigned', handlePlayerAssigned);
            socketService.off('game_state_update', handleGameStateUpdate);
            socketService.off('commitment_generated', handleCommitmentGenerated);
            socketService.off('game_result', handleGameResult);
            socketService.off('error_message', handleErrorMsg);
            socketService.off('loading_update', handleLoadingUpdate);
            socketService.off('game_reset_signal', handleGameResetSignal);
        };
    }, [handleConnect, handleDisconnect, handleConnectError, handlePlayerAssigned, 
        handleGameStateUpdate, handleCommitmentGenerated, handleGameResult, 
        handleErrorMsg, handleLoadingUpdate, handleGameResetSignal]);

    const formatSaltForInput = (salt: string): string => {
        if (typeof salt !== 'string') return '';
        let formattedSalt = salt.trim();
        if (formattedSalt && !formattedSalt.startsWith('0x')) {
            formattedSalt = '0x' + formattedSalt;
        }
        return formattedSalt;
    };

    const handleGetCommitment = (playerId: 'P1' | 'P2', move: number, salt: string) => {
        if (connectionStatus !== 'connected') {
            alert("Not connected to server. Please wait or try reconnecting.");
            return;
        }
        if (salt.trim() === '') {
            alert('Salt cannot be empty!');
            return;
        }
        const saltForValidation = formatSaltForInput(salt);
        if (!/^0x[0-9a-fA-F]+$/.test(saltForValidation) && saltForValidation !== '0x') {
            alert('Salt should be a hex string (e.g., 0x123abc). Ensure it contains only hex characters after "0x".');
            return;
        }
        console.log(`[App.tsx] Requesting commitment for ${playerId} with move: ${move}, salt: ${salt}`);
        socketService.emit('get_commitment', { playerId, move, salt });
    };

    const handleConfirmCommit = (playerId: 'P1' | 'P2', commitment: string) => {
        if (connectionStatus !== 'connected') {
            alert("Not connected to server.");
            return;
        }
        console.log(`[App.tsx] Confirming commitment for ${playerId}:`, { commitment });
        socketService.emit('player_commit', { playerId, commitment });
        setShowCommitModal(false);
        setModalData(null);
    };

    const handleReveal = (playerId: 'P1' | 'P2') => {
        if (connectionStatus !== 'connected') {
            alert("Not connected to server.");
            return;
        }
        const playerState = gameState.players[playerId];
        if (!playerState) {
            alert(`Cannot reveal for ${playerId}. Player not found in game state.`);
            return;
        }
        if (!playerState.hasCommitted) {
            alert(`Cannot reveal for ${playerId}. Player has not committed yet.`);
            return;
        }
        if (playerState.hasRevealed) {
            alert(`Cannot reveal for ${playerId}. Player has already revealed.`);
            return;
        }
        console.log(`[App.tsx] Requesting reveal for ${playerId}. Server will use its stored move/salt.`);
        socketService.emit('player_reveal', { playerId });
    };
    
    const handleResetGame = () => {
        if (connectionStatus !== 'connected') {
            alert("Not connected to server.");
            return;
        }
        console.log("[App.tsx] Requesting game reset.");
        if (gameState.currentTurn !== 'GAME_OVER' && gameState.currentTurn !== 'CONNECTING' &&
            (gameState.players.P1?.hasCommitted || gameState.players.P2?.hasCommitted)) {
            if (!window.confirm('Game is in progress. Are you sure you want to reset?')) {
                return;
            }
        }
        socketService.emit('reset_game', {});
    };

    const handleManualReconnect = () => {
        if (connectionStatus === 'connecting') {
            console.log("[App.tsx] Already attempting to connect.");
            return;
        }
        if (socketService.socket.connected) {
            console.log("[App.tsx] Already connected.");
            setConnectionStatus('connected');
            return;
        }
        console.log("[App.tsx] Manually attempting to reconnect...");
        setConnectionStatus('connecting'); 
        socketService.connect();
    };

    const isAttemptingConnection = connectionStatus === 'connecting';

    return (
        <div className="app-container">
            <header>
                <h1>Zero-Knowledge Rock-Paper-Scissors</h1>
                {connectionStatus === 'disconnected' && (
                    <div className="connection-error">
                        Disconnected. <button onClick={handleManualReconnect} disabled={isAttemptingConnection}>
                            {isAttemptingConnection ? 'Connecting...' : 'Reconnect'}
                        </button>
                    </div>
                )}
                 {connectionStatus === 'error' && (
                    <div className="connection-error">
                        Connection Error. <button onClick={handleManualReconnect} disabled={isAttemptingConnection}>
                            {isAttemptingConnection ? 'Retrying...' : 'Retry Connect'}
                        </button>
                    </div>
                )}
                {isLoading && <div className="loading-indicator">{loadingMessage}</div>}
            </header>

            {connectionStatus === 'connected' && assignedPlayerId && (
                 <p className="player-role-display">You are playing as: <strong>Player {assignedPlayerId}</strong> (Socket ID: {socketService.socket.id})</p>
            )}
            {connectionStatus === 'connected' && !assignedPlayerId && (
                 <p className="player-role-display">Connected. Waiting for player assignment...</p>
            )}
             {connectionStatus === 'connecting' &&  (
                 <p className="player-role-display">Attempting to connect to server...</p>
            )}

            <main className="game-area">
                <div className="player-section">
                    <PlayerControl
                        playerId="P1"
                        onGetCommitment={handleGetCommitment}
                        onReveal={handleReveal}
                        playerState={gameState.players.P1}
                        currentTurn={gameState.currentTurn}
                        localMove={p1InputMove}
                        setLocalMove={setP1InputMove}
                        localSalt={p1InputSalt}
                        setLocalSalt={setP1InputSalt}
                    />
                </div>
                <div className="player-section">
                    <PlayerControl
                        playerId="P2"
                        onGetCommitment={handleGetCommitment}
                        onReveal={handleReveal}
                        playerState={gameState.players.P2}
                        currentTurn={gameState.currentTurn}
                        localMove={p2InputMove}
                        setLocalMove={setP2InputMove}
                        localSalt={p2InputSalt}
                        setLocalSalt={setP2InputSalt}
                    />
                </div>
            </main>

            <GameDisplay gameState={gameState} MOVE_MAP={MOVE_MAP} />
            
            <button 
                onClick={handleResetGame} 
                className="reset-button" 
                disabled={isLoading || connectionStatus !== 'connected'}
            >
                Reset Game
            </button>

            {showCommitModal && modalData && (
                <CommitModal
                    playerId={modalData.playerId}
                    commitment={modalData.commitment}
                    move={modalData.move}
                    salt={modalData.salt}
                    onConfirm={handleConfirmCommit}
                    onClose={() => { setShowCommitModal(false); setModalData(null); }}
                />
            )}
            
            <footer>
                <p>Game Status: {gameState.currentTurn.replace(/_/g, ' ')} | Connection: {connectionStatus}</p>
                {gameState.winner && <p className="winner-announcement">Winner: {gameState.winner}!</p>}
                
                <div className="debug-info" style={{ fontSize: '0.8rem', color: '#777', marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                    <strong>Debug Info (Client Input State):</strong><br/>
                    P1 Input Move: {p1InputMove !== null ? MOVE_MAP[p1InputMove] : 'None'}, P1 Input Salt: {p1InputSalt || 'None'}<br/>
                    P2 Input Move: {p2InputMove !== null ? MOVE_MAP[p2InputMove] : 'None'}, P2 Input Salt: {p2InputSalt || 'None'}<br/>
                    Socket ID: {socketService.socket.id || 'N/A'}
                </div>
            </footer>
        </div>
    );
}

export default App;
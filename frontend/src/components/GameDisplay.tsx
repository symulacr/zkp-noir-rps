import React from 'react';

interface PlayerState {
    id: string;
    move?: number;
    commitment?: string;
    hasCommitted: boolean;
    hasRevealed: boolean;
    proofVerified?: boolean;
}

interface GameStateForDisplay {
    players: { P1?: PlayerState; P2?: PlayerState };
    currentTurn: string;
    messageLog: string[];
    winner?: 'P1' | 'P2' | 'Draw';
}

interface GameDisplayProps {
    gameState: GameStateForDisplay;
    MOVE_MAP: { [key: number]: string };
}

const GameDisplay: React.FC<GameDisplayProps> = ({ gameState, MOVE_MAP }) => {
    const p1State = gameState.players.P1;
    const p2State = gameState.players.P2;

    const getMoveName = (moveValue?: number): string => {
        if (typeof moveValue === 'number') {
            return MOVE_MAP[moveValue] || `Unknown Move (${moveValue})`;
        }
        return 'N/A';
    };

    return (
        <div className="game-display">
            <h3>Game Status & Log</h3>
            <div className="status-overview">
                <p><strong>Current Turn:</strong> {gameState.currentTurn.replace(/_/g, ' ')}</p>
                {p1State && (
                    <p>
                        P1 Committed: {p1State.hasCommitted ? 'Yes' : 'No'},
                        P1 Revealed: {p1State.hasRevealed ? `Yes (${getMoveName(p1State.move)})` : 'No'}
                        {p1State.hasRevealed && ` (Proof: ${p1State.proofVerified ? 'Verified' : p1State.proofVerified === false ? 'Failed' : 'Pending'})`}
                    </p>
                )}
                {p2State && (
                    <p>
                        P2 Committed: {p2State.hasCommitted ? 'Yes' : 'No'},
                        P2 Revealed: {p2State.hasRevealed ? `Yes (${getMoveName(p2State.move)})` : 'No'}
                        {p2State.hasRevealed && ` (Proof: ${p2State.proofVerified ? 'Verified' : p2State.proofVerified === false ? 'Failed' : 'Pending'})`}
                    </p>
                )}
            </div>

            {gameState.winner && (
                <div className="winner-announcement-display">
                    <h4>Game Over!</h4>
                    <p>Player 1 played: {getMoveName(p1State?.move)}</p>
                    <p>Player 2 played: {getMoveName(p2State?.move)}</p>
                    <p><strong>Winner: {gameState.winner}</strong></p>
                </div>
            )}

            <h4>Message Log:</h4>
            <ul className="message-log">
                {gameState.messageLog.slice().reverse().map((msg, index) => (
                    <li key={index}>{msg}</li>
                ))}
            </ul>
        </div>
    );
};

export default GameDisplay;
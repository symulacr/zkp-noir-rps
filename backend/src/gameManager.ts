// backend/src/gameManager.ts
import { Server, Socket } from 'socket.io';
import { NargoManager, MoveSalt } from '../noir_bindings/NargoManager';
import path from 'path';

interface PlayerState {
    id: string;
    socketId: string;
    move?: number; // 0: Rock, 1: Paper, 2: Scissors
    salt?: string; // hex string
    commitment?: string; // hex string
    hasCommitted: boolean;
    hasRevealed: boolean;
    proofVerified?: boolean;
}

interface GameState {
    players: { P1?: PlayerState; P2?: PlayerState };
    currentTurn: 'P1_COMMIT' | 'P2_COMMIT' | 'P1_REVEAL' | 'P2_REVEAL' | 'GAME_OVER';
    messageLog: string[];
    winner?: 'P1' | 'P2' | 'Draw';
    isProcessingZK: boolean;
}

let gameState: GameState = resetGameState();
const nargoManager = new NargoManager();

function resetGameState(): GameState {
    return {
        players: {},
        currentTurn: 'P1_COMMIT',
        messageLog: ['Game started. Player 1, please choose your move and salt to get a commitment.'],
        isProcessingZK: false,
    };
}

function determineWinner(p1Move: number, p2Move: number): 'P1' | 'P2' | 'Draw' {
    if (p1Move === p2Move) return 'Draw';
    if (
        (p1Move === 0 && p2Move === 2) || // Rock beats Scissors
        (p1Move === 1 && p2Move === 0) || // Paper beats Rock
        (p1Move === 2 && p2Move === 1)    // Scissors beats Paper
    ) {
        return 'P1';
    }
    return 'P2';
}

// Helper to format salt consistently
function formatSalt(salt: string): string {
    let formattedSalt = salt.trim();
    if (!formattedSalt.startsWith('0x')) {
        formattedSalt = '0x' + formattedSalt;
    }
    return formattedSalt;
}

export function initializeGameEvents(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.log(`Player connected: ${socket.id}`);

        let assignedPlayerId: 'P1' | 'P2' | null = null;
        if (!gameState.players.P1) {
            assignedPlayerId = 'P1';
            gameState.players.P1 = { id: 'P1', socketId: socket.id, hasCommitted: false, hasRevealed: false };
            socket.emit('player_assigned', { playerId: 'P1' });
        } else if (!gameState.players.P2) {
            assignedPlayerId = 'P2';
            gameState.players.P2 = { id: 'P2', socketId: socket.id, hasCommitted: false, hasRevealed: false };
            socket.emit('player_assigned', { playerId: 'P2' });
        } else {
            socket.emit('error_message', { message: 'Game is full.' });
            socket.disconnect();
            return;
        }
        
        io.emit('game_state_update', { gameState, message: `${assignedPlayerId} joined. Current turn: ${gameState.currentTurn}` });

        socket.on('get_commitment', async (data: { playerId: 'P1' | 'P2'; move: number; salt: string }) => {
            if (gameState.isProcessingZK) {
                socket.emit('error_message', { message: 'Server is busy with a ZK operation. Please wait.' });
                return;
            }
            if (gameState.currentTurn !== `${data.playerId}_COMMIT`) {
                 socket.emit('error_message', { message: `Not your turn to commit, or already committed. Current turn: ${gameState.currentTurn}` });
                 return;
            }
            const player = gameState.players[data.playerId];
            if (!player || player.hasCommitted) {
                socket.emit('error_message', { message: 'Invalid player or already committed.' });
                return;
            }

            gameState.isProcessingZK = true;
            io.emit('loading_update', { isLoading: true, message: `Generating commitment for ${data.playerId}...` });

            try {
                // Format salt consistently with 0x prefix
                const formattedSalt = formatSalt(data.salt);
                
                console.log(`Generating commitment for ${data.playerId} with move=${data.move}, salt=${formattedSalt}`);
                
                // Store move and formatted salt in player object
                player.move = data.move;
                player.salt = formattedSalt;
                
                const commitment = await nargoManager.generateCommitment({ 
                    move: data.move, 
                    salt: formattedSalt 
                });
                
                console.log(`Generated commitment for ${data.playerId}: ${commitment}`);
                
                // Send commitment back to client for confirmation
                socket.emit('commitment_generated', { 
                    playerId: data.playerId, 
                    commitment, 
                    move: data.move, 
                    salt: formattedSalt 
                });
                
                gameState.messageLog.push(`${data.playerId} received commitment parameters. Confirm to proceed.`);
            } catch (error) {
                console.error('Commitment generation error:', error);
                socket.emit('error_message', { message: `Failed to generate commitment: ${(error as Error).message}` });
                gameState.messageLog.push(`Error generating commitment for ${data.playerId}.`);
            } finally {
                gameState.isProcessingZK = false;
                io.emit('loading_update', { isLoading: false, message: '' });
                io.emit('game_state_update', { gameState, message: gameState.messageLog });
            }
        });

        socket.on('player_commit', (data: { playerId: 'P1' | 'P2'; commitment: string }) => {
            if (gameState.currentTurn !== `${data.playerId}_COMMIT`) {
                 socket.emit('error_message', { message: `Not your turn to commit. Current turn: ${gameState.currentTurn}` });
                 return;
            }
            const player = gameState.players[data.playerId];
            if (!player || player.hasCommitted) {
                socket.emit('error_message', { message: 'Invalid player or already committed.' });
                return;
            }

            // Store the commitment (the move and salt are already stored from get_commitment)
            player.commitment = data.commitment;
            player.hasCommitted = true;
            
            console.log(`Player ${data.playerId} committed with commitment=${data.commitment}, stored move=${player.move}, stored salt=${player.salt}`);
            
            gameState.messageLog.push(`${data.playerId} has committed.`);

            if (data.playerId === 'P1') {
                gameState.currentTurn = 'P2_COMMIT';
                gameState.messageLog.push('Player 2, please choose your move and salt to get a commitment.');
            } else if (data.playerId === 'P2') {
                gameState.currentTurn = 'P1_REVEAL';
                gameState.messageLog.push('Both players committed. Player 1, please reveal your move.');
            }
            io.emit('game_state_update', { gameState, message: gameState.messageLog });
        });

        socket.on('player_reveal', async (data: { playerId: 'P1' | 'P2' }) => {
            if (gameState.isProcessingZK) {
                socket.emit('error_message', { message: 'Server is busy with a ZK operation. Please wait.' });
                return;
            }
            if (gameState.currentTurn !== `${data.playerId}_REVEAL`) {
                socket.emit('error_message', { message: `Not your turn to reveal. Current turn: ${gameState.currentTurn}` });
                return;
            }
            const player = gameState.players[data.playerId];
            if (!player || !player.hasCommitted || player.hasRevealed) {
                socket.emit('error_message', { message: 'Invalid player, not committed, or already revealed.' });
                return;
            }
            
            gameState.isProcessingZK = true;
            io.emit('loading_update', { isLoading: true, message: `Generating and verifying ZK proof for ${data.playerId}'s reveal...` });
            
            let proofNameForCleanup: string | null = null;

            try {
                // We use ONLY server-stored values for verification
                console.log(`Received reveal request for ${data.playerId}. Using server-stored values:`, {
                    storedMove: player.move,
                    storedSalt: player.salt,
                    storedCommitment: player.commitment
                });
                
                if (!player.move || !player.salt || !player.commitment) {
                    throw new Error("Missing required player data for ZK verification");
                }
                
                const { proofPath, verifierTomlPath } = await nargoManager.generateProof({
                    move: player.move,
                    salt: player.salt,
                    commitment: player.commitment,
                });
                
                // Extract proof name from path for verify and cleanup
                proofNameForCleanup = path.basename(proofPath, '.gz');

                const verified = await nargoManager.verifyProof(proofNameForCleanup);

                if (verified) {
                    player.hasRevealed = true;
                    player.proofVerified = true;
                    gameState.messageLog.push(`${data.playerId} revealed and proof verified successfully! Move: ${player.move}`);
                    
                    if (data.playerId === 'P1') {
                        gameState.currentTurn = 'P2_REVEAL';
                        gameState.messageLog.push('Player 2, please reveal your move.');
                    } else if (data.playerId === 'P2') {
                        // Both revealed, determine winner
                        gameState.currentTurn = 'GAME_OVER';
                        const p1 = gameState.players.P1!;
                        const p2 = gameState.players.P2!;
                        if (p1.proofVerified && p2.proofVerified) {
                            const winner = determineWinner(p1.move!, p2.move!);
                            gameState.winner = winner;
                            const resultMessage = `Game Over! P1 played ${p1.move}, P2 played ${p2.move}. Winner: ${winner}`;
                            gameState.messageLog.push(resultMessage);
                            io.emit('game_result', { winner, p1Move: p1.move, p2Move: p2.move, message: resultMessage });
                        } else {
                            gameState.messageLog.push('Game Over, but one or more proofs failed verification.');
                            io.emit('error_message', { message: 'Proof verification failed for one or more players.' });
                        }
                    }
                } else {
                    player.proofVerified = false;
                    gameState.messageLog.push(`ZK proof verification failed for ${data.playerId}.`);
                    socket.emit('error_message', { message: 'ZK proof verification failed.' });
                }
            } catch (error) {
                console.error('Reveal/Proof error:', error);
                socket.emit('error_message', { message: `Error during reveal/proof process: ${(error as Error).message}` });
                gameState.messageLog.push(`Error during ${data.playerId}'s reveal: ${(error as Error).message}.`);
            } finally {
                gameState.isProcessingZK = false;
                io.emit('loading_update', { isLoading: false, message: '' });
                io.emit('game_state_update', { gameState, message: gameState.messageLog });
                if (proofNameForCleanup) {
                    // Just pass the basename to cleanupProof
                    nargoManager.cleanupProof(proofNameForCleanup).catch(err => 
                        console.warn("Failed to cleanup proof:", err));
                }
            }
        });

        socket.on('reset_game', () => {
            gameState = resetGameState();
            io.emit('game_state_update', { gameState, message: 'Game has been reset. Player 1, start.' });
            io.emit('game_reset_signal');
        });

        socket.on('disconnect', () => {
            console.log(`Player disconnected: ${socket.id}`);
            if (assignedPlayerId && gameState.players[assignedPlayerId]) {
                delete gameState.players[assignedPlayerId];
                gameState.messageLog.push(`${assignedPlayerId} disconnected.`);
                if (!gameState.players.P1 || !gameState.players.P2) {
                    gameState.currentTurn = !gameState.players.P1 ? 'P1_COMMIT' : 'P2_COMMIT';
                    if (Object.keys(gameState.players).length === 0) {
                        gameState = resetGameState();
                        io.emit('game_state_update', { gameState, message: 'All players disconnected. Game reset.' });
                    } else {
                        io.emit('game_state_update', { gameState, message: 'A player disconnected. Waiting for new player.' });
                    }
                }
            }
        });
    });
}
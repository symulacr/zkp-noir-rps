import React, { useState } from 'react';

const rockImg = '../assets/rock.png';
const paperImg = '../assets/paper.png';
const scissorsImg = '../assets/scissors.png';

const MOVES = [
    { value: 0, name: 'Rock', img: '/rock.png' },
    { value: 1, name: 'Paper', img: '/paper.png' },
    { value: 2, name: 'Scissors', img: '/scissors.png' }
];

interface PlayerControlProps {
    playerId: 'P1' | 'P2';
    onGetCommitment: (playerId: 'P1' | 'P2', move: number, salt: string) => void;
    onReveal: (playerId: 'P1' | 'P2') => void;
    playerState?: {
        commitment?: string;
        hasCommitted: boolean;
        hasRevealed: boolean;
        move?: number;
        proofVerified?: boolean;
        salt?: string;
    };
    currentTurn: string;
    localMove: number | null;
    setLocalMove: (move: number | null) => void;
    localSalt: string;
    setLocalSalt: (salt: string) => void;
}

const PlayerControl: React.FC<PlayerControlProps> = ({
    playerId,
    onGetCommitment,
    onReveal,
    playerState,
    currentTurn,
    localMove,
    setLocalMove,
    localSalt,
    setLocalSalt
}) => {

    const generateRandomSalt = () => {
        const array = new Uint32Array(8);
        window.crypto.getRandomValues(array);
        let hexSalt = '0x';
        array.forEach(val => {
            hexSalt += val.toString(16).padStart(8, '0');
        });
        setLocalSalt(hexSalt.substring(0, 2 + 62)); 
    };

    const handleGetCommitmentClick = () => {
        if (localMove === null) {
            alert('Please select a move.');
            return;
        }
        if (localSalt.trim() === '' || localSalt.trim() === '0x') {
            alert('Please enter or generate a valid salt.');
            return;
        }
        onGetCommitment(playerId, localMove, localSalt);
    };
    
    const isMyCommitPhase = currentTurn === `${playerId}_COMMIT` && !playerState?.hasCommitted;
    const isMyRevealPhase = currentTurn === `${playerId}_REVEAL` && playerState?.hasCommitted && !playerState?.hasRevealed;

    return (
        <div className={`player-control ${playerId.toLowerCase()}`}>
            <h3>Player {playerId}</h3>
            
            {isMyCommitPhase && (
                <div className="move-selection">
                    <h4>Select Move:</h4>
                    {MOVES.map((moveOption) => (
                        <button
                            key={moveOption.value}
                            className={`move-button ${localMove === moveOption.value ? 'selected' : ''}`}
                            onClick={() => setLocalMove(moveOption.value)}
                        >
                            <img src={moveOption.img} alt={moveOption.name} /> {moveOption.name}
                        </button>
                    ))}
                </div>
            )}

            {isMyCommitPhase && (
                <div className="salt-input">
                    <h4>Salt:</h4>
                    <input
                        type="text"
                        placeholder="Enter hex salt (e.g., 0xabc123)"
                        value={localSalt}
                        onChange={(e) => setLocalSalt(e.target.value)}
                    />
                    <button onClick={generateRandomSalt}>
                        Generate Random Salt
                    </button>
                </div>
            )}

            {isMyCommitPhase && (
                <button 
                    onClick={handleGetCommitmentClick} 
                    className="action-button get-commitment-button" 
                    disabled={localMove === null || localSalt.trim() === '' || localSalt.trim() === '0x'}
                >
                    Get Commitment Parameters
                </button>
            )}
            
            {isMyRevealPhase && (
                <button 
                    onClick={() => onReveal(playerId)} 
                    className="action-button reveal-button"
                >
                    Reveal Move
                </button>
            )}

            {playerState?.commitment && (
                <div className="commitment-display">
                    <p><strong>Commitment:</strong></p>
                    <p className="commitment-hash">{playerState.commitment}</p>
                    {!playerState.hasRevealed && playerState.hasCommitted && <p>(Move is hidden until reveal)</p>}
                </div>
            )}

            {playerState?.hasRevealed && (
                <div className="revealed-info">
                    <p><strong>Revealed Move:</strong> {MOVES.find(m => m.value === playerState.move)?.name || `Move ${playerState.move}`}</p>
                    <p><strong>Salt Used:</strong> <small className="salt-display">{playerState.salt || "N/A (should be available from server)"}</small></p>
                    <p><strong>Proof Status:</strong> {
                        playerState.proofVerified === true ? 'Verified' :
                        playerState.proofVerified === false ? 'Verification Failed' :
                        'Pending/Unknown'
                    }</p>
                </div>
            )}
        </div>
    );
};

export default PlayerControl;
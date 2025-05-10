import React from 'react';

interface CommitModalProps {
    playerId: 'P1' | 'P2';
    commitment: string;
    move: number; // for display/confirmation, not strictly needed for commit action
    salt: string; // for display/confirmation
    onConfirm: (playerId: 'P1' | 'P2', commitment: string) => void;
    onClose: () => void;
}

const MOVE_MAP = {
    0: 'Rock',
    1: 'Paper',
    2: 'Scissors'
  };

const CommitModal: React.FC<CommitModalProps> = ({ playerId, commitment, move, salt, onConfirm, onClose }) => {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Confirm Commitment for Player {playerId}</h3>
                <p>Your chosen move: <strong>{MOVE_MAP[move]}</strong></p>
                <p>Your salt: <small className="salt-display">{salt}</small></p>
                <p>The server has generated the following cryptographic commitment for these values:</p>
                <p className="commitment-hash-modal"><strong>{commitment}</strong></p>
                <p>Do you want to commit to this value?</p>
                <div className="modal-actions">
                    <button onClick={() => onConfirm(playerId, commitment)} className="confirm-button">Confirm & Commit</button>
                    <button onClick={onClose} className="cancel-button">Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default CommitModal;
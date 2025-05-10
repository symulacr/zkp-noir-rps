// this circuit takes a move and a salt, and returns their pedersen hash commitment.
fn main(move: u8, salt: Field) -> pub Field {
    // ensure the move is valid (0 for rock, 1 for paper, 2 for scissors)
    assert((move == 0) | (move == 1) | (move == 2), "Invalid move provided for commitment generation");

    // compute the poseidon hash
    let commitment = std::hash::poseidon::bn254::hash_2([salt, move as Field]);
    commitment
}
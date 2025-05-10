// this circuit verifies that a given move and salt match a public commitment,
// and that the move itself is valid (0, 1, or 2).
fn main(move: u8, salt: Field, commitment: pub Field) {
    // the move must be valid (0 for rock, 1 for paper, 2 for scissors)
    assert((move == 0) | (move == 1) | (move == 2), "Invalid move: must be 0, 1, or 2");

    // poseidon hash of (salt, move) must match the public commitment
    let calculated_commitment = std::hash::poseidon::bn254::hash_2([salt, move as Field]);
    assert(calculated_commitment == commitment, "Calculated commitment does not match provided public commitment");
}
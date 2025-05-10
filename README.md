# ZK-RPS: Zero-Knowledge Rock-Paper-Scissors

**Submission for NoirHack 2025**  
Repository: `https://github.com/symulacr/zkp-noir-rps`

## Project Overview

ZK-RPS is a web-based implementation of the classic Rock-Paper-Scissors game, enhanced with Zero-Knowledge Proofs (ZKPs) to ensure fair play. This project demonstrates a practical application of Noir for creating verifiable off-chain game logic, making advanced cryptographic concepts accessible within a familiar context.

The core mechanism employs a commit-reveal scheme:
1. **Commit Phase**: Players choose a move (Rock, Paper, or Scissors) and a secret salt. A cryptographic commitment (Poseidon hash) is generated using a dedicated Noir helper circuit. This commitment is shared, effectively "locking in" the move without revealing it.
2. **Reveal Phase**: After both players have committed, they reveal their original move and salt.
3. **Verification Phase**: A primary Noir ZKP circuit is used to verify that the revealed move and salt correctly correspond to the player's prior commitment and that the move itself is a valid game choice (0 for Rock, 1 for Paper, 2 for Scissors). This verification is performed by the backend using `nargo execute`, where a successful execution (generation of a witness) serves as the proof.

The game supports the full lifecycle from move selection to ZKP-backed verification and winner determination. For ease of demonstration and evaluation, a single user can control both Player 1 and Player 2 from the same browser interface. Additionally, command-line interface (CLI) tools are provided for independent technical validation of the ZK circuits.

## How Noir is Utilized

Noir is central to the ZKP implementation:
* Two primary Noir circuits are developed:
  * **`commitment_helper` circuit**: Located in `noir_circuits/commitment_helper/`. It takes a player's `move` (u8) and `salt` (Field) as private inputs and computes their Poseidon hash (`std::hash::poseidon::bn254::hash_2`) as a public output (Field). This output is the cryptographic commitment.
  * **`rps_logic` circuit**: Located in `noir_circuits/rps_logic/`. It takes the `move` (u8) and `salt` (Field) as private inputs and the `commitment` (Field) as a public input. It re-calculates the Poseidon hash using the private inputs and asserts its equality with the public commitment. It also constrains the move to be a valid game choice.
* The backend server interacts with these compiled Noir circuits using the `nargo` command-line tool (version `1.0.0-beta.3` was used during development), specifically `nargo execute`, to generate commitments and verify revealed moves.

## Technology Stack

* **Zero-Knowledge Circuits**: Noir Language
* **Backend**: Node.js, Express.js, Socket.IO
  * Server Logic: `backend/runApp.js`
  * Default Port: `4000`
* **Frontend**: React (with Vite), TypeScript
  * Default Port: `3000`
* **Core ZK Interaction**: `nargo` CLI

## Prerequisites

* **Node.js**: Version 18.x or 20.x is recommended.
* **Noir Toolchain (`nargo`)**: Version `1.0.0-beta.3` was used. Install via `noirup` ([Noir Installation Guide](https://noir-lang.org/docs/getting_started/installation)). Ensure `nargo` is in your system's PATH.
* **Git**: For cloning the repository.

## Setup and Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/symulacr/zkp-noir-rps.git
   cd zkp-noir-rps
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   cd ..
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Compile Noir Circuits (Optional - Pre-compiled Artifacts Included):**
   The compiled circuit artifacts (ACIR JSON files) are included in the `noir_circuits/*/target/` directories. If you wish to recompile them:
   ```bash
   cd noir_circuits/commitment_helper
   nargo compile
   cd ../rps_logic
   nargo compile
   cd ../..
   ```

## Running the Application

1. **Start the Backend Server:**
   Open a terminal, navigate to the `backend` directory:
   ```bash
   node runApp.js
   ```
   The server should start and log that it's listening on port 4000. Ensure `nargo` is accessible in the PATH of this terminal session.

2. **Start the Frontend Development Server:**
   Open a *new* terminal, navigate to the `frontend` directory:
   ```bash
   npm run dev
   ```
   Vite will compile the frontend and typically open the application in your web browser at `http://localhost:3000`.

3. **Access the Game:**
   Navigate to `http://localhost:3000` in your browser.

## Gameplay Walkthrough (Single-User, Dual-Player Control)

The UI allows a single user to operate both Player 1 and Player 2 for demonstration:

1. **Player 1 - Commit Move:**
   * In the "Player 1" section, select a move (Rock, Paper, or Scissors).
   * Enter a hexadecimal salt (e.g., `0x123abc`) or click the `[NEW SALT]` button.
   * Click the `[LOCK IN MOVE]` button (or similar, text may vary based on UI version).
   * A confirmation modal will appear displaying the generated commitment hash. Click `[CONFIRM]`.
2. **Player 2 - Commit Move:**
   * Repeat the same process for Player 2.
3. **Player 1 - Reveal Move:**
   * Once both players have committed, the turn will be for Player 1 to reveal.
   * In Player 1's section, click the `[REVEAL MOVE]` button.
   * The backend will use Noir to generate and verify a ZK proof that the revealed move and salt match the stored commitment.
4. **Player 2 - Reveal Move:**
   * Repeat for Player 2.
5. **Game Result:**
   * After both players have successfully revealed their moves and their proofs are verified, the game winner will be displayed.
6. **Reset Game:**
   * Click the `[RESET GAME]` button to start a new game.

## CLI Validation Tools

For direct and independent verification of the ZK circuit logic, follow these steps:

Navigate to the `cli-tools/` directory:
```bash
cd cli-tools
```

### Generate a Commitment
This step uses the `commitment_helper` circuit.

```bash
node generateCommit.js --move <0|1|2> --salt <0xHEX_STRING>
```
Example:
```bash
node generateCommit.js --move 1 --salt 0xcafebabe
```
This command outputs the commitment hash, which is a positive hexadecimal string representing the field element.

### Generate and Verify a Proof for a Reveal
This step uses the `rps_logic` circuit.

```bash
node proveAndVerify.js --move <0|1|2> --salt <0xHEX_STRING> --commitment <POSITIVE_HEX_COMMITMENT_STRING>
```
Example:
```bash
node proveAndVerify.js --move 1 --salt 0xcafebabe --commitment <0x_hash_output_from_generateCommit>
```
This tool attempts to generate a witness using `nargo execute`. A successful execution indicates that the proof is valid, and it will report either "SUCCESS" or "FAILURE".

## Project Scope for NoirHack

This project was developed entirely during the NoirHack event. The primary focus was on successfully implementing the end-to-end ZKP flow for game fairness, from circuit design in Noir to backend integration and frontend interaction. Key challenges included understanding and correctly handling field element representations between Nargo's output and its Prover.toml input requirements.

## Future Enhancements (Potential)

* Full UI overhaul to a more polished, themed interface (initial steps for a "terminal aesthetic" were explored).
* Enhanced multiplayer support for distinct users over a network.
* Integration with wallet connections for player identity or on-chain elements.
* Exploration of more complex games using similar ZKP principles.

## License

MIT
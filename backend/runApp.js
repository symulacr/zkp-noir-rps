const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const NARGO_COMMAND = 'nargo';
const COMMITMENT_HELPER_CIRCUIT_PATH = path.resolve(__dirname, '../noir_circuits/commitment_helper');
const RPS_LOGIC_CIRCUIT_PATH = path.resolve(__dirname, '../noir_circuits/rps_logic');

const BN254_SCALAR_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let gameState = resetGameState();
let gameJustResetFlag = false; // flag to prevent rapid re-resets
const RESET_FLAG_DURATION_MS = 2000; // cooldown for the flag (2 seconds)

// --- helper functions ---
function resetGameState() {
  console.log("[GAME] Resetting game state NOW. Players cleared, turn to P1_COMMIT.");
  return {
    players: {}, 
    currentTurn: 'P1_COMMIT',
    messageLog: ['Game reset. Player 1, please choose your move and salt.'],
    winner: null,
    isProcessingZK: false
  };
}

function formatSalt(salt) {
  if (typeof salt !== 'string') salt = String(salt);
  let formattedSalt = salt.trim();
  if (!formattedSalt.startsWith('0x')) formattedSalt = '0x' + formattedSalt;
  if (!/^0x[0-9a-fA-F]*$/.test(formattedSalt)) console.warn(`[FORMAT_SALT] Salt "${salt}" formatted to "${formattedSalt}" might still need hex chars.`);
  return formattedSalt;
}

function parseNargoOutputToPositiveHex(rawOutput) {
    const match = rawOutput.match(/Field\(([-\d]+)\)/);
    if (match && match[1]) {
        let fieldValue = BigInt(match[1]);
        if (fieldValue < 0n) fieldValue = fieldValue + BN254_SCALAR_FIELD_MODULUS;
        if (fieldValue >= BN254_SCALAR_FIELD_MODULUS) fieldValue = fieldValue % BN254_SCALAR_FIELD_MODULUS;
        const hexCommitment = '0x' + fieldValue.toString(16);
        return hexCommitment;
    }
    console.error("[PARSE_HEX] Could not parse 'Field(value)' from Nargo output:", rawOutput);
    throw new Error("Could not parse Nargo output as Field element: " + rawOutput);
}

function generateCommitmentOnServer(move, salt) {
  const formattedSalt = formatSalt(salt);
  const proverToml = `move = "${move}"\nsalt = "${formattedSalt}"\n`;
  const proverTomlPath = path.join(COMMITMENT_HELPER_CIRCUIT_PATH, 'Prover.toml');
  fs.writeFileSync(proverTomlPath, proverToml);
  try {
    const command = `cd "${COMMITMENT_HELPER_CIRCUIT_PATH}" && ${NARGO_COMMAND} execute witness_name_ignored_for_commit --force`;
    const rawOutput = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    const commitmentHex = parseNargoOutputToPositiveHex(rawOutput);
    console.log(`[GEN_COMMIT] OK (hex): ${commitmentHex} for move ${move}`);
    return commitmentHex;
  } catch (error) { 
    console.error("[GEN_COMMIT] Error:", error.message); 
    if(error.stderr) console.error("Nargo stderr:", error.stderr.toString()); 
    throw error; 
  } 
  finally { 
    try { fs.unlinkSync(proverTomlPath); } catch (e) { /*ignore*/ } 
  }
}

function verifyMoveWithZKProof(move, salt, commitmentHex) {
  const formattedSalt = formatSalt(salt);
  const uniqueWitnessName = `rps_reveal_witness_${Date.now()}`;
  const proverToml = `move = "${move}"\nsalt = "${formattedSalt}"\ncommitment = "${commitmentHex}"\n`;
  const proverTomlPath = path.join(RPS_LOGIC_CIRCUIT_PATH, 'Prover.toml');
  fs.writeFileSync(proverTomlPath, proverToml);
  const witnessFilePath = path.join(RPS_LOGIC_CIRCUIT_PATH, 'target', `${uniqueWitnessName}.gz`);
  try {
    const command = `cd "${RPS_LOGIC_CIRCUIT_PATH}" && ${NARGO_COMMAND} execute ${uniqueWitnessName} --force`;
    execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    if (fs.existsSync(witnessFilePath)) { 
        console.log(`[VERIFY_PROOF] OK: Witness for move ${move} generated.`);
        return true; 
    }
    console.warn(`[VERIFY_PROOF] Nargo OK but witness file ${witnessFilePath} not found.`);
    return false;
  } catch (error) { 
      console.error(`[VERIFY_PROOF] Error for witness ${uniqueWitnessName}:`, error.message);
      if (error.stderr) console.error("[VERIFY_PROOF] Nargo stderr:", error.stderr.toString());
      return false; 
  } 
  finally { 
      try { fs.unlinkSync(proverTomlPath); } catch (e) { /*ignore*/ }
      try { if (fs.existsSync(witnessFilePath)) fs.unlinkSync(witnessFilePath); } catch (e) { /*ignore*/ }
  }
}

function determineWinner(p1Move, p2Move) {
  console.log(`[DETERMINE_WINNER] P1 Mv: ${p1Move}, P2 Mv: ${p2Move}`);
  if (p1Move === p2Move) { console.log("[DETERMINE_WINNER] Result: Draw"); return 'Draw'; }
  if ((p1Move === 0 && p2Move === 2) || (p1Move === 1 && p2Move === 0) || (p1Move === 2 && p2Move === 1)) {
    console.log("[DETERMINE_WINNER] Result: P1 wins"); return 'P1';
  }
  console.log("[DETERMINE_WINNER] Result: P2 wins"); return 'P2';
}

io.on('connection', (socket) => {
  console.log(`[CONNECTION] Player connected: ${socket.id}. Active P1: ${gameState.players.P1?.socketId}, P2: ${gameState.players.P2?.socketId}`);
  let assignedPlayerId = null;
  
  if (!gameState.players.P1) {
    assignedPlayerId = 'P1';
    gameState.players.P1 = { id: 'P1', socketId: socket.id, hasCommitted: false, hasRevealed: false };
    console.log(`[ASSIGN] Socket ${socket.id} assigned as P1.`);
  } else if (!gameState.players.P2) {
    assignedPlayerId = 'P2';
    gameState.players.P2 = { id: 'P2', socketId: socket.id, hasCommitted: false, hasRevealed: false };
    console.log(`[ASSIGN] Socket ${socket.id} assigned as P2.`);
  } else {
    socket.emit('error_message', { message: 'Game is full. Please try again later.' });
    console.log(`[ASSIGN] Game full. Disconnecting ${socket.id}.`);
    socket.disconnect();
    return;
  }
  socket.emit('player_assigned', { playerId: assignedPlayerId });
  io.emit('game_state_update', { gameState, message: `${assignedPlayerId} joined. Current Turn: ${gameState.currentTurn}` });

  socket.on('get_commitment', async (data) => {
    const player = gameState.players[data.playerId];
    if (!player || player.socketId !== socket.id) {
      console.warn(`[AUTH_FAIL] GetCommit: Socket ${socket.id} (claims ${data.playerId}) vs Stored ${data.playerId} (${player?.socketId})`);
      return socket.emit('error_message', { message: 'Role authentication failed. Your game session might be outdated.' });
    }
    if (gameState.isProcessingZK) { return socket.emit('error_message', { message: 'Server busy.' }); }
    if (gameState.currentTurn !== `${data.playerId}_COMMIT` || player.hasCommitted) { return socket.emit('error_message', { message: `Not your turn (${gameState.currentTurn}) or already committed.` }); }
    if (typeof data.move !== 'number' || data.move < 0 || data.move > 2 || typeof data.salt !== 'string' || data.salt.trim() === '') { return socket.emit('error_message', { message: 'Invalid move/salt.' });}
    gameState.isProcessingZK = true;
    io.emit('loading_update', { isLoading: true, message: `Generating commitment for ${data.playerId}...` });
    try {
      const serverSalt = formatSalt(data.salt);
      const commitmentHex = await generateCommitmentOnServer(data.move, serverSalt);
      player.move = data.move; player.salt = serverSalt; player.commitment = commitmentHex;
      socket.emit('commitment_generated', { playerId: data.playerId, commitment: player.commitment, move: player.move, salt: player.salt });
      gameState.messageLog.push(`${data.playerId} received commitment parameters. Confirm commit.`);
    } catch (error) { socket.emit('error_message', { message: `Commitment failed: ${error.message}` });} 
    finally { 
        gameState.isProcessingZK = false;
        io.emit('loading_update', { isLoading: false, message: '' });
        io.emit('game_state_update', { gameState });
    }
  });

  socket.on('player_commit', (data) => {
    const player = gameState.players[data.playerId];
    if (!player || player.socketId !== socket.id) { return socket.emit('error_message', {message: 'Auth fail commit.'}); }
    if (gameState.currentTurn !== `${data.playerId}_COMMIT` || player.hasCommitted) { return socket.emit('error_message', {message: 'Commit turn/state error.'}); }
    if (player.commitment !== data.commitment) { console.warn(`[PLAYER_COMMIT] Client/Server commitment mismatch for ${data.playerId}.`); }
    player.hasCommitted = true;
    gameState.messageLog.push(`${data.playerId} committed.`);
    console.log(`[PLAYER_COMMIT] ${data.playerId} (${socket.id}) OK.`);
    if (data.playerId === 'P1' && gameState.players.P2) { gameState.currentTurn = 'P2_COMMIT'; gameState.messageLog.push('P2 to commit.'); } 
    else if (data.playerId === 'P1' && !gameState.players.P2) { gameState.messageLog.push('P1 committed. Waiting for P2 to join and commit.');} 
    else if (data.playerId === 'P2') { gameState.currentTurn = 'P1_REVEAL'; gameState.messageLog.push('P1 to reveal.'); }
    io.emit('game_state_update', { gameState });
  });

  socket.on('player_reveal', async (data) => {
    const player = gameState.players[data.playerId];
    if (!player || player.socketId !== socket.id) { return socket.emit('error_message', {message: 'Auth fail reveal.'});}
    if (gameState.isProcessingZK) { return socket.emit('error_message', {message: 'Server busy.'}); }
    if (gameState.currentTurn !== `${data.playerId}_REVEAL` || !player.hasCommitted || player.hasRevealed) { return socket.emit('error_message', {message: 'Reveal turn/state error.'}); }
    if (typeof player.move !== 'number' || !player.salt || !player.commitment) { return socket.emit('error_message', {message: 'Server player data error.'});}

    gameState.isProcessingZK = true;
    io.emit('loading_update', { isLoading: true, message: `Verifying ${data.playerId}'s move...` });
    try {
      const proofIsValid = await verifyMoveWithZKProof(player.move, player.salt, player.commitment);
      if (proofIsValid) {
        player.hasRevealed = true; player.proofVerified = true;
        gameState.messageLog.push(`${data.playerId} revealed move ${player.move}. ZK Proof Verified!`);
        console.log(`[PLAYER_REVEAL_SUCCESS] ${data.playerId} ZK proof verified.`);
        if (data.playerId === 'P1' && gameState.players.P2?.hasCommitted) {
          gameState.currentTurn = 'P2_REVEAL'; gameState.messageLog.push('P2 to reveal.');
        } else if (data.playerId === 'P1' && !gameState.players.P2?.hasCommitted) {
          gameState.currentTurn = 'GAME_OVER'; gameState.winner = 'P1';
          gameState.messageLog.push('P2 has not committed or is disconnected. P1 wins by default.');
          io.emit('game_result', { winner: 'P1', p1Move: player.move, message: 'P2 did not commit. P1 wins.' });
        } else if (data.playerId === 'P2') {
          gameState.currentTurn = 'GAME_OVER';
          const p1 = gameState.players.P1; const p2 = gameState.players.P2;
          if (p1 && p1.proofVerified && p2 && p2.proofVerified && typeof p1.move === 'number' && typeof p2.move === 'number') {
            const winner = determineWinner(p1.move, p2.move); gameState.winner = winner;
            const resultMessage = `Game Over! P1 played move ${p1.move}, P2 played move ${p2.move}. Winner: ${winner}`;
            gameState.messageLog.push(resultMessage);
            io.emit('game_result', { winner, p1Move: p1.move, p2Move: p2.move, message: resultMessage });
            console.log(`[GAME_END] ${resultMessage}`);
          }
        }
      } else {
          player.proofVerified = false; gameState.messageLog.push(`ZK proof FAIL for ${data.playerId}.`);
          socket.emit('error_message', { message: 'ZK proof verification failed.' });
          console.error(`[PLAYER_REVEAL_FAIL] ${data.playerId} ZK proof FAILED.`);
          gameState.currentTurn = 'GAME_OVER'; 
          const otherPlayerKey = data.playerId === 'P1' ? 'P2' : 'P1';
          if (gameState.players[otherPlayerKey]?.hasCommitted) { gameState.winner = otherPlayerKey; }
      }
    } catch (error) { } 
    finally { 
        gameState.isProcessingZK = false;
        io.emit('loading_update', { isLoading: false, message: '' });
        io.emit('game_state_update', { gameState });
    }
  });

  socket.on('reset_game', () => {
    console.log(`[RESET_GAME_REQ] Received from ${socket.id}. Current turn: ${gameState.currentTurn}. GameJustReset: ${gameJustResetFlag}`);

    if (gameJustResetFlag) {
        console.log(`[RESET_GAME_REQ] Ignored for ${socket.id} due to recent reset flag.`);
        io.emit('game_state_update', { gameState, message: 'Game is resetting...' }); 
        io.emit('game_reset_signal');
        return;
    }

    if (gameState.currentTurn === 'GAME_OVER' || 
        (gameState.currentTurn === 'P1_COMMIT' && !gameState.players.P1?.hasCommitted && !gameState.players.P2?.hasCommitted) ) {
      console.log("[RESET_GAME_REQ] Conditions met. Processing full game reset.");
      
      if (gameState.players.P1) delete gameState.players.P1;
      if (gameState.players.P2) delete gameState.players.P2;
      
      gameState = resetGameState(); 
      
      gameJustResetFlag = true;
      setTimeout(() => { 
          console.log("[RESET_FLAG_TIMEOUT] Clearing gameJustResetFlag.");
          gameJustResetFlag = false; 
      }, RESET_FLAG_DURATION_MS);

      io.emit('game_state_update', { gameState, message: 'Game has been reset. New game starting.' });
      io.emit('game_reset_signal'); 
      console.log(`[GAME] Game reset by ${socket.id}. Player slots cleared. Current turn: ${gameState.currentTurn}`);
    } else {
      console.log(`[RESET_GAME_REQ] Ignored for socket ${socket.id}. Game turn: ${gameState.currentTurn}. Conditions for full reset not met (e.g., game in progress).`);
      socket.emit('info_message', { message: `Game cannot be reset now (Phase: ${gameState.currentTurn}). Wait for game to end.` });
      socket.emit('game_state_update', { gameState, message: `Current game phase: ${gameState.currentTurn}` });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Player disconnected: ${socket.id}`);
    let disconnectedPlayerRole = null;
    let wasP1 = gameState.players.P1 && gameState.players.P1.socketId === socket.id;
    let wasP2 = gameState.players.P2 && gameState.players.P2.socketId === socket.id;

    if (wasP1) { disconnectedPlayerRole = 'P1'; delete gameState.players.P1; }
    else if (wasP2) { disconnectedPlayerRole = 'P2'; delete gameState.players.P2; }

    if (disconnectedPlayerRole) {
        console.log(`[DISCONNECT] Active ${disconnectedPlayerRole} (socket ${socket.id}) disconnected. Slot cleared.`);
        gameState.messageLog.push(`${disconnectedPlayerRole} disconnected.`);
        if (gameState.currentTurn !== 'GAME_OVER') {
            console.log(`[DISCONNECT] ${disconnectedPlayerRole} disconnected mid-game. Resetting game.`);
            gameJustResetFlag = true; 
            setTimeout(() => { gameJustResetFlag = false; }, RESET_FLAG_DURATION_MS);
            gameState = resetGameState();
            io.emit('game_state_update', { gameState, message: `Player ${disconnectedPlayerRole} disconnected. Game has been reset.`});
            io.emit('game_reset_signal');
        } else { 
            io.emit('game_state_update', { gameState, message: `${disconnectedPlayerRole} disconnected after game over.` });
        }
    }
  });
});

// start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`ZK-RPS Backend Server listening on port ${PORT}`);
  
  console.log(`Commitment Helper Circuit Path: ${COMMITMENT_HELPER_CIRCUIT_PATH}`);
  console.log(`RPS Logic Circuit Path: ${RPS_LOGIC_CIRCUIT_PATH}`);
  
  if (!fs.existsSync(COMMITMENT_HELPER_CIRCUIT_PATH)) {
    console.error(`FATAL ERROR: Commitment Helper Circuit Path NOT FOUND: ${COMMITMENT_HELPER_CIRCUIT_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(RPS_LOGIC_CIRCUIT_PATH)) {
    console.error(`FATAL ERROR: RPS Logic Circuit Path NOT FOUND: ${RPS_LOGIC_CIRCUIT_PATH}`);
    process.exit(1);
  }
  
  const commitmentHelperTarget = path.join(COMMITMENT_HELPER_CIRCUIT_PATH, 'target');
  if (!fs.existsSync(commitmentHelperTarget)) 
    console.warn(`WARNING: Commitment helper circuit at ${COMMITMENT_HELPER_CIRCUIT_PATH} might not be compiled (no 'target' dir).`);
  else 
    console.log(`Found target directory for commitment_helper: ${commitmentHelperTarget}`);
    
  const rpsLogicTarget = path.join(RPS_LOGIC_CIRCUIT_PATH, 'target');
  if (!fs.existsSync(rpsLogicTarget)) 
    console.warn(`WARNING: RPS logic circuit at ${RPS_LOGIC_CIRCUIT_PATH} might not be compiled (no 'target' dir).`);
  else 
    console.log(`Found target directory for rps_logic: ${rpsLogicTarget}`);
});
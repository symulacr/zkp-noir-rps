const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RPS_LOGIC_CIRCUIT_PATH = path.resolve(__dirname, '../noir_circuits/rps_logic');
const NARGO_PATH = 'nargo';

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function proveAndVerify(move, salt, commitment) {
  console.log("\n=== DIAGNOSTIC INFO ===");
  console.log(`RPS_LOGIC_CIRCUIT_PATH: ${RPS_LOGIC_CIRCUIT_PATH}`);
  console.log(`Directory exists: ${fs.existsSync(RPS_LOGIC_CIRCUIT_PATH)}`);

  const targetDir = path.join(RPS_LOGIC_CIRCUIT_PATH, 'target');
  console.log(`Target directory exists: ${fs.existsSync(targetDir)}`);
  if (fs.existsSync(targetDir)) {
    const files = fs.readdirSync(targetDir);
    console.log(`Files in target directory: ${files.join(', ')}`);
  }

  if (![0, 1, 2].includes(parseInt(move))) {
    console.error('Error: Move must be 0 (Rock), 1 (Paper), or 2 (Scissors).');
    process.exit(1);
  }

  let formattedSalt = salt;
  if (!formattedSalt.startsWith('0x')) {
    formattedSalt = '0x' + formattedSalt;
  }

  let formattedCommitment = commitment;
  if (!formattedCommitment.startsWith('0x')) {
    formattedCommitment = '0x' + formattedCommitment;
  }

  console.log(`Using move: ${move}, salt: ${formattedSalt}, commitment: ${formattedCommitment}`);

  const proverTomlContent = `move = "${move}"\nsalt = "${formattedSalt}"\ncommitment = "${formattedCommitment}"\n`;
  const proverTomlPath = path.join(RPS_LOGIC_CIRCUIT_PATH, 'Prover.toml');

  const witnessName = `cli_test_proof_${Date.now()}`;

  ensureDirectoryExists(targetDir);

  const witnessPath = path.join(targetDir, `${witnessName}.gz`);

  try {
    fs.writeFileSync(proverTomlPath, proverTomlContent);
    console.log(`Created Prover.toml file:\n${proverTomlContent}`);

    if (!fs.existsSync(path.join(targetDir, 'rps_logic.json'))) {
      console.log("Compiling circuit first...");
      const compileOutput = execSync(`cd "${RPS_LOGIC_CIRCUIT_PATH}" && ${NARGO_PATH} compile`, 
                                  { encoding: 'utf8' });
      console.log("Compile output:", compileOutput);
    }

    console.log('\n=== GENERATING WITNESS ===');
    console.log(`Witness name: ${witnessName}`);

    const executeCommand = `cd "${RPS_LOGIC_CIRCUIT_PATH}" && ${NARGO_PATH} execute ${witnessName}`;
    console.log(`Executing command: ${executeCommand}`);

    let executeOutput;
    try {
      executeOutput = execSync(executeCommand, { encoding: 'utf8' });
      console.log("=== EXECUTE OUTPUT ===");
      console.log(executeOutput);
      console.log("===================\n");
    } catch (error) {
      console.error("Error during witness generation:");
      console.error(error.message);
      if (error.stdout) console.log("STDOUT:", error.stdout);
      if (error.stderr) console.error("STDERR:", error.stderr);
      process.exit(1);
    }

    const witnessExists = fs.existsSync(witnessPath);
    console.log(`Witness file exists at ${witnessPath}: ${witnessExists}`);

    console.log('\n=== VERIFICATION RESULT ===');
    if (witnessExists) {
      console.log('✅ SUCCESS: Constraints satisfied! Witness generated successfully.');
      console.log('For Nargo 1.0.0-beta.3, successful witness generation means all constraints were satisfied.');
    } else {
      console.log('❌ FAILURE: Witness generation failed. Constraints not satisfied.');

      console.log('\n=== ADDITIONAL DIAGNOSTICS FOR FAILURE ===');
      console.log('For this circuit, the verification requires:');
      console.log('1. move must be 0, 1, or 2');
      console.log('2. The commitment must exactly match std::hash::pedersen([salt, move as Field], 0)');

      console.log('\nTest calculating the commitment again to verify:');

      const testPath = path.join(RPS_LOGIC_CIRCUIT_PATH, 'test_commitment.toml');
      fs.writeFileSync(testPath, `move = "${move}"\nsalt = "${formattedSalt}"\n`);

      try {
        const testOutput = execSync(
          `cd "${path.resolve(__dirname, '../noir_circuits/commitment_helper')}" && ${NARGO_PATH} execute witness_name_ignored`,
          { encoding: 'utf8' }
        );
        console.log("Test commitment calculation output:", testOutput);

        let testCommitment = null;
        const match3 = testOutput.match(/Field\(([-\d]+)\)/);

        if (match3 && match3[1]) {
          const fieldValue = BigInt(match3[1]);
          testCommitment = "0x" + (fieldValue < 0n ? 
            (fieldValue + (1n << 256n)).toString(16) : 
            fieldValue.toString(16));
        }

        if (testCommitment) {
          console.log(`Calculated test commitment: ${testCommitment}`);
          console.log(`Provided commitment: ${formattedCommitment}`);
          console.log(`Commitments ${testCommitment === formattedCommitment ? 'MATCH' : 'DO NOT MATCH'}`);
          
          if (testCommitment !== formattedCommitment) {
            console.log("This is likely the source of the verification failure");
          }
        }

        fs.unlinkSync(testPath);
      } catch (error) {
        console.error("Error testing commitment calculation:", error.message);
      }
    }
  } catch (error) {
    console.error('General error:');
    console.error(error);
    process.exit(1);
  } finally {
    try { 
      if (fs.existsSync(proverTomlPath)) {
        fs.unlinkSync(proverTomlPath);
        console.log("Cleaned up Prover.toml");
      }
    } catch (e) { 
      console.log("Note: Failed to clean up Prover.toml");
    }
  }
}

const args = process.argv.slice(2);
if (args.length < 6 || args[0] !== '--move' || args[2] !== '--salt' || args[4] !== '--commitment') {
  console.log('Usage: node proveAndVerify.js --move <0|1|2> --salt <HEX_STRING> --commitment <HEX_STRING>');
  process.exit(1);
}

proveAndVerify(args[1], args[3], args[5])
  .catch(err => {
    console.error("Error in proveAndVerify:", err);
  });
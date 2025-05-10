// cli-tools/generateCommit.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMMITMENT_HELPER_CIRCUIT_PATH = path.resolve(__dirname, '../noir_circuits/commitment_helper');
const NARGO_PATH = 'nargo'; // assume nargo is in path

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function generateCommitment(move, salt) {
  console.log("\n=== DIAGNOSTIC INFO ===");
  console.log(`COMMITMENT_HELPER_CIRCUIT_PATH: ${COMMITMENT_HELPER_CIRCUIT_PATH}`);
  console.log(`Directory exists: ${fs.existsSync(COMMITMENT_HELPER_CIRCUIT_PATH)}`);
  
  const targetDir = path.join(COMMITMENT_HELPER_CIRCUIT_PATH, 'target');
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
  console.log(`Using move: ${move}, salt: ${formattedSalt}`);
  
  const proverTomlContent = `move = "${move}"\nsalt = "${formattedSalt}"\n`;
  const proverTomlPath = path.join(COMMITMENT_HELPER_CIRCUIT_PATH, 'Prover.toml');
  
  try {
    fs.writeFileSync(proverTomlPath, proverTomlContent);
    console.log(`Created Prover.toml file:\n${proverTomlContent}`);
    
    if (!fs.existsSync(path.join(targetDir, 'commitment_helper.json'))) {
      console.log("Compiling circuit first...");
      const compileOutput = execSync(`cd "${COMMITMENT_HELPER_CIRCUIT_PATH}" && ${NARGO_PATH} compile`, 
                                   { encoding: 'utf8' });
      console.log("Compile output:", compileOutput);
    }
    
    console.log("Executing nargo...");
    const command = `cd "${COMMITMENT_HELPER_CIRCUIT_PATH}" && ${NARGO_PATH} execute witness_name_ignored`;
    const output = execSync(command, { encoding: 'utf8' });
    
    console.log("\n=== RAW NARGO OUTPUT ===");
    console.log(output);
    console.log("=== END NARGO OUTPUT ===\n");
    
    let commitment = null;
    let match = output.match(/Returned: (0x[0-9a-fA-F]+)/);
    if (match && match[1]) {
      commitment = match[1];
      console.log("Extracted using pattern 1 (Returned: 0x...)");
    }
    
    if (!commitment) {
      match = output.match(/(0x[0-9a-fA-F]+)/);
      if (match && match[1]) {
        commitment = match[1];
        console.log("Extracted using pattern 2 (0x...)");
      }
    }
    
    if (!commitment) {
      match = output.match(/Field\(([-\d]+)\)/);
      if (match && match[1]) {
        const fieldValue = BigInt(match[1]);
        commitment = "0x" + (fieldValue < 0n ? 
          (fieldValue + (1n << 256n)).toString(16) : 
          fieldValue.toString(16));
        console.log("Extracted using pattern 3 (Field value)");
      }
    }
    
    if (!commitment) {
      const lines = output.trim().split('\n');
      const lastLine = lines[lines.length - 1].trim();
      commitment = lastLine.startsWith('0x') ? lastLine : '0x' + lastLine;
      console.log("Extracted using pattern 4 (last line)");
    }
    
    if (!commitment) {
      console.error("Failed to extract commitment from output");
      process.exit(1);
    }

    console.log('\n=== COMMITMENT GENERATION DETAILS ===');
    console.log(`Move: ${move} (${['Rock', 'Paper', 'Scissors'][move]})`);
    console.log(`Salt: ${formattedSalt}`);
    console.log(`Generated Commitment: ${commitment}`);
    console.log('=======================================\n');
    
    return commitment;

  } catch (error) {
    console.error('Error during nargo execute:');
    console.error(error.message);
    if (error.stderr) console.error("STDERR:", error.stderr);
    process.exit(1);
  } finally {
    try {
      fs.unlinkSync(proverTomlPath);
      console.log("Cleaned up Prover.toml");
    } catch (e) { 
      console.log("Note: Failed to clean up Prover.toml");
    }
  }
}

const args = process.argv.slice(2);
if (args.length < 4 || args[0] !== '--move' || args[2] !== '--salt') {
  console.log('Usage: node generateCommit.js --move <0|1|2> --salt <HEX_STRING>');
  process.exit(1);
}

generateCommitment(args[1], args[3])
  .then(commitment => {
    console.log("FINAL COMMITMENT:", commitment);
    console.log(`\nTo verify this commitment, run:\nnode proveAndVerify.js --move ${args[1]} --salt ${args[3]} --commitment ${commitment}`);
  })
  .catch(err => {
    console.error("Error in generateCommitment:", err);
  });
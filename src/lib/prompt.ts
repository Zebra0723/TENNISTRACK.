// Interactive prompt helpers built on node:readline. Kept tiny and dependency-free.

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

function isNonInteractive(): boolean {
  // In CI or when piped, we cannot prompt. Callers should treat this as "no".
  return !stdin.isTTY || process.env.SETUP_AGENT_YES === "1";
}

export async function ask(question: string, fallback = ""): Promise<string> {
  if (isNonInteractive()) return fallback;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${question} `);
    return answer.trim() || fallback;
  } finally {
    rl.close();
  }
}

// Yes/no confirmation. Defaults to "no" for safety unless SETUP_AGENT_YES=1.
export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  if (process.env.SETUP_AGENT_YES === "1") return true;
  if (!stdin.isTTY) return false;
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

// Read a secret without echoing it to the terminal.
export async function askSecret(question: string): Promise<string> {
  if (isNonInteractive()) return "";
  const rl = readline.createInterface({ input: stdin, output: stdout });
  // Suppress echo of typed characters (only emit newlines).
  const rlAny = rl as unknown as { _writeToOutput?: (s: string) => void };
  rlAny._writeToOutput = function (stringToWrite: string) {
    if (stringToWrite.includes("\n") || stringToWrite.includes("\r")) {
      stdout.write("\n");
    }
  };
  try {
    stdout.write(`${question} `);
    const answer = await rl.question("");
    return answer.trim();
  } finally {
    rl.close();
  }
}

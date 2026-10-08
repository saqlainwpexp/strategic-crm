// `npm run create-admin` — creates (or resets) the Super Admin account.
// Run it yourself in a terminal: the password is typed hidden and never stored in plain text.

import readline from "readline";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MIN = 10;

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the prompt, then echo nothing while the password is typed.
      const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      out._writeToOutput = (s: string) => {
        if (s.startsWith(question)) out.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\nCreate the Super Admin account\n");
  const name = await ask("Full name: ");
  const email = (await ask("Email: ")).toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A name and a valid email are required.");

  const password = await ask(`Password (min ${MIN} characters): `, true);
  if (password.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
  const confirm = await ask("Confirm password: ", true);
  if (password !== confirm) throw new Error("Passwords don't match.");

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { name, role: "SUPER_ADMIN", active: true, passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
    });
    console.log(`\n✓ Updated ${email} — now an active Super Admin with the new password.`);
  } else {
    await prisma.user.create({
      data: { name, email, role: "SUPER_ADMIN", title: "Super Admin", passwordHash, passwordChangedAt: new Date() },
    });
    console.log(`\n✓ Created Super Admin ${email}.`);
  }
  await prisma.auditLog.create({ data: { action: "user.create_admin_cli", entityType: "User", meta: { email } } });
  console.log("Sign in at your CRM address, then add your team under Team → Add member.\n");
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

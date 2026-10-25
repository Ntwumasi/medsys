/**
 * Scripts in this folder delete data or reset passwords. They used to live in
 * database/migrations/, where the tracked runner (and CI, on every push) would
 * execute them against any database whose _migrations table wasn't seeded.
 *
 * They now refuse to run unless the operator opts in explicitly:
 *   ALLOW_DANGEROUS_SCRIPTS=I_UNDERSTAND npx ts-node src/scripts/dangerous/<file>.ts
 */
export const requireDangerousOptIn = (scriptName: string): void => {
  if (process.env.ALLOW_DANGEROUS_SCRIPTS !== 'I_UNDERSTAND') {
    console.error(
      `Refusing to run ${scriptName}: it changes or deletes live data.\n` +
        `Set ALLOW_DANGEROUS_SCRIPTS=I_UNDERSTAND to run it on purpose, and check DATABASE_URL first.`
    );
    process.exit(1);
  }
};

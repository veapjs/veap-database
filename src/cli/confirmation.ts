import type { CommandContext, Output } from "@veap/kernel/cli";

/** Environments in which changing the database asks for a confirmation first. */
const GUARDED_ENVIRONMENTS = new Set(["production", "prod"]);

/**
 * The gate every command that changes the database goes through.
 *
 * Outside production it stays silent: `veap migrate` on a developer machine is a
 * routine step and should not need a confirmation. Inside production the command
 * asks first, and `--force` is how an unattended run says yes — a pipeline runs
 * `veap migrate --force`. Passing `--no-interaction` without `--force` resolves
 * the prompt to its default ("no"), so an unattended run can never touch
 * production data by accident, and it can never hang waiting for input either.
 */
export async function confirmToProceed(
  context: CommandContext,
  output: Output,
  /** Sentence describing the action, e.g. "Run the pending migrations". */
  action: string,
): Promise<boolean> {
  if (context.flags.force) return true;
  if (!GUARDED_ENVIRONMENTS.has(context.env)) return true;

  // No quotes around the environment name on purpose: this question is also
  // rendered inside the non-TTY error message, where nested quotes read badly.
  const confirmed = await output.confirm(
    `The application is running in ${context.env}. ${action}?`,
    { default: false },
  );

  if (!confirmed) output.warn("Cancelled.");

  return confirmed;
}

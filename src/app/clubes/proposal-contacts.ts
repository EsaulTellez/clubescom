import { pool } from "@/lib/db";

export async function getProposalContacts(proposalId: string) {
  const result = await pool.query<{ id: string; name: string; email: string }>(
    "select id, name, email from public.get_club_proposal_contacts($1)",
    [proposalId],
  );
  return result.rows;
}

import { procedureOffice } from "@/lib/areas";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { card } from "@/lib/ui";
import { asFaqs, asSteps } from "@/app/guias/shared";
import { ForoGuiasBoard, type DirectoryRoom, type ForumAnswerItem, type ForumQuestionItem, type GuideItem } from "./foro-guias-board";
import { firstParam, isArea, isUuid } from "./shared";

export const dynamic = "force-dynamic";

type RawGuideRow = {
  id: string;
  area: string;
  title: string;
  summary: string;
  steps: unknown;
  faqs: unknown;
  version: number;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: Date;
  author_name: string;
};

type RawQuestionRow = {
  id: string;
  author_id: string;
  area: string;
  request_kind: string;
  target_guide_id: string | null;
  target_step_index: number | null;
  target_guide_title: string | null;
  title: string;
  body: string;
  image_url: string | null;
  is_pinned: boolean;
  status: string;
  created_at: Date;
  author_name: string;
  votes: number;
  voted: boolean;
};

type RawAnswerRow = {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  official: boolean;
  created_at: Date;
  author_name: string;
  author_role: string;
  author_area: string | null;
  score: number;
  viewer_vote: number;
};

export default async function ForoPage({
  searchParams,
}: {
  searchParams: Promise<{
    area?: string | string[];
    q?: string | string[];
    duda?: string | string[];
    guia?: string | string[];
    vista?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const areaParam = firstParam(params.area) ?? "";
  const initialArea = isArea(areaParam) ? areaParam : "all";
  const initialQuery = (firstParam(params.q) ?? "").trim().slice(0, 120);
  const dudaParam = firstParam(params.duda) ?? "";
  const initialDudaId = isUuid(dudaParam) ? dudaParam : null;
  const guiaParam = firstParam(params.guia) ?? "";
  const initialGuiaId = isUuid(guiaParam) ? guiaParam : null;
  const vistaParam = firstParam(params.vista) ?? "";
  const initialView =
    vistaParam === "guias" || vistaParam === "oficiales" || vistaParam === "abiertas"
      ? vistaParam
      : "todo";

  const user = await getSession();

  let guides: GuideItem[] = [];
  let questions: ForumQuestionItem[] = [];
  let rooms: DirectoryRoom[] = [];
  let dbDown = false;

  try {
    const [guidesRes, progressRes, questionsRes, answersRes, roomsRes] = await Promise.all([
      pool.query<RawGuideRow>(
        `select g.id, g.area, g.title, g.summary, g.steps, g.faqs, g.version,
                g.attachment_url, g.attachment_name, g.created_at, u.name as author_name
         from public.guides g
         join public.users u on u.id = g.author_id
         order by g.created_at desc`,
      ),
      user
        ? pool.query<{ guide_id: string; completed_steps: unknown }>(
            `select guide_id, completed_steps from public.guide_progress where user_id = $1`,
            [user.id],
          )
        : Promise.resolve({ rows: [] as { guide_id: string; completed_steps: unknown }[] }),
      pool.query<RawQuestionRow>(
        `select q.id, q.author_id, q.area, q.request_kind, q.target_guide_id, q.target_step_index,
                tg.title as target_guide_title, q.title, q.body, q.image_url, q.is_pinned, q.status,
                q.created_at, u.name as author_name,
                (select count(*)::int from public.question_votes qv where qv.question_id = q.id) as votes,
                exists (
                  select 1 from public.question_votes qv
                  where qv.question_id = q.id and $1::uuid is not null and qv.user_id = $1::uuid
                ) as voted
         from public.questions q
         join public.users u on u.id = q.author_id
         left join public.guides tg on tg.id = q.target_guide_id
         order by q.is_pinned desc, votes desc, q.created_at desc`,
        [user?.id ?? null],
      ),
      pool.query<RawAnswerRow>(
        `select a.id, a.question_id, a.author_id, a.body, a.official, a.created_at,
                u.name as author_name, u.role::text as author_role, u.area as author_area,
                coalesce((select sum(av.vote)::int from public.answer_votes av where av.answer_id = a.id), 0) as score,
                coalesce((
                  select av.vote::int from public.answer_votes av
                  where av.answer_id = a.id and $1::uuid is not null and av.user_id = $1::uuid
                  limit 1
                ), 0) as viewer_vote
         from public.answers a
         join public.users u on u.id = a.author_id
         order by a.official desc, score desc, a.created_at asc`,
        [user?.id ?? null],
      ),
      pool.query<DirectoryRoom>(
        `select code, kind, name, description
         from public.map_rooms
         where code in ('G002', 'G103', 'G101')
         order by code asc`,
      ),
    ]);

    const progressMap = new Map<string, number[]>();
    for (const p of progressRes.rows) {
      if (Array.isArray(p.completed_steps)) {
        progressMap.set(
          p.guide_id,
          p.completed_steps.filter((n): n is number => typeof n === "number"),
        );
      }
    }

    guides = guidesRes.rows.map((g) => ({
      id: g.id,
      area: g.area,
      title: g.title,
      summary: g.summary,
      steps: asSteps(g.steps),
      faqs: asFaqs(g.faqs),
      version: g.version,
      attachmentUrl: g.attachment_url,
      attachmentName: g.attachment_name,
      createdAtIso: new Date(g.created_at).toISOString(),
      authorName: g.author_name,
      completedSteps: progressMap.get(g.id) ?? [],
    }));

    const answersByQuestion = new Map<string, ForumAnswerItem[]>();
    for (const a of answersRes.rows) {
      const list = answersByQuestion.get(a.question_id) ?? [];
      list.push({
        id: a.id,
        questionId: a.question_id,
        authorId: a.author_id,
        body: a.body,
        official: a.official,
        createdAtIso: new Date(a.created_at).toISOString(),
        authorName: a.author_name,
        authorRole: a.author_role,
        authorArea: a.author_area,
        score: a.score,
        viewerVote: a.viewer_vote === 1 ? 1 : a.viewer_vote === -1 ? -1 : 0,
      });
      answersByQuestion.set(a.question_id, list);
    }

    questions = questionsRes.rows.map((q) => ({
      id: q.id,
      authorId: q.author_id,
      area: q.area,
      requestKind: q.request_kind,
      targetGuideId: q.target_guide_id,
      targetStepId: q.target_step_index,
      targetGuideTitle: q.target_guide_title,
      title: q.title,
      body: q.body,
      imageUrl: q.image_url,
      isPinned: q.is_pinned,
      status: q.status,
      createdAtIso: new Date(q.created_at).toISOString(),
      authorName: q.author_name,
      votes: q.votes,
      voted: q.voted,
      answers: answersByQuestion.get(q.id) ?? [],
    }));

    rooms = roomsRes.rows;
  } catch {
    dbDown = true;
  }

  return (
    <div className="board-page">
      <RealtimeRefresh tables={["questions", "answers", "question_votes", "answer_votes", "guides"]} />

      {dbDown && (
        <p className={card} role="status">
          No se pudieron cargar los datos. Vuelve a intentarlo en un momento.
        </p>
      )}

      <ForoGuiasBoard
        guides={guides}
        initialQuestions={questions}
        directoryRooms={rooms}
        viewer={
          user
            ? {
                id: user.id,
                name: user.name,
                role: user.role,
                area: user.area,
              }
            : null
        }
        initialArea={procedureOffice(user) ?? initialArea}
        initialQuery={initialQuery}
        initialView={initialView}
        initialDudaId={initialDudaId}
        initialGuiaId={initialGuiaId}
      />
    </div>
  );
}

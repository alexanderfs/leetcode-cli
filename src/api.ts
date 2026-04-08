import { getCookie, getCsrfToken } from './config';

const LEETCODE_BASE = 'https://leetcode.cn';
const GRAPHQL_URL = `${LEETCODE_BASE}/graphql/`;

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': getCookie(),
      'x-csrftoken': getCsrfToken(),
      'Referer': LEETCODE_BASE,
      'User-Agent': 'Mozilla/5.0 (compatible; leetcode-cli)',
    },
    body: JSON.stringify({ query, variables }),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: unknown; errors?: unknown[] };

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data;
}

// ── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Extract titleSlug from a LeetCode CN problem URL.
 * Accepts formats like:
 *   https://leetcode.cn/problems/combinations/
 *   https://leetcode.cn/problems/combinations/description/
 */
export function slugFromUrl(url: string): string {
  const match = url.match(/\/problems\/([^/]+)/);
  if (!match || !match[1]) {
    throw new Error(`Cannot parse titleSlug from URL: ${url}`);
  }
  return match[1];
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface ProblemInfo {
  questionId: string;
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: string;
  topicTags: { name: string; slug: string }[];
  content: string;
  acRate: number;
  isPaidOnly: boolean;
}

export async function getProblemDetail(titleSlug: string): Promise<ProblemInfo> {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        difficulty
        acRate
        isPaidOnly
        topicTags { name slug }
        content
      }
    }
  `;
  const data = (await gql(query, { titleSlug })) as { question: ProblemInfo };
  return data.question;
}

export interface SubmissionRecord {
  id: string;
  title: string;
  titleSlug: string;
  timestamp: string;
  statusDisplay: string;
  lang: string;
  runtime: string;
  memory: string;
}

export async function getRecentSubmissions(limit = 20): Promise<SubmissionRecord[]> {
  const query = `
    query recentSubmissions($limit: Int!) {
      recentSubmissionList(limit: $limit) {
        id
        title
        titleSlug
        timestamp
        statusDisplay
        lang
        runtime
        memory
      }
    }
  `;
  const data = (await gql(query, { limit })) as {
    recentSubmissionList: SubmissionRecord[];
  };
  return data.recentSubmissionList;
}

export interface UserProfile {
  userSlug: string;
  realName: string;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalSubmissions: number;
  easySubmissions: number;
  mediumSubmissions: number;
  hardSubmissions: number;
}

export async function getUserProfile(userSlug: string): Promise<UserProfile> {
  const query = `
    query userStats($userSlug: String!) {
      userStatus { realName }
      userProfileUserQuestionProgress(userSlug: $userSlug) {
        numAcceptedQuestions { difficulty count }
      }
      userProfileUserQuestionSubmitStats(userSlug: $userSlug) {
        acSubmissionNum { difficulty count }
      }
    }
  `;
  const data = (await gql(query, { userSlug })) as {
    userStatus: { realName: string };
    userProfileUserQuestionProgress: {
      numAcceptedQuestions: { difficulty: string; count: number }[];
    };
    userProfileUserQuestionSubmitStats: {
      acSubmissionNum: { difficulty: string; count: number }[];
    };
  };

  const toMap = (arr: { difficulty: string; count: number }[]) =>
    Object.fromEntries(arr.map((s) => [s.difficulty.toLowerCase(), s.count]));

  const solved = toMap(data.userProfileUserQuestionProgress.numAcceptedQuestions);
  const submitted = toMap(data.userProfileUserQuestionSubmitStats.acSubmissionNum);

  return {
    userSlug,
    realName: data.userStatus.realName,
    totalSolved: (solved['easy'] ?? 0) + (solved['medium'] ?? 0) + (solved['hard'] ?? 0),
    easySolved: solved['easy'] ?? 0,
    mediumSolved: solved['medium'] ?? 0,
    hardSolved: solved['hard'] ?? 0,
    totalSubmissions: (submitted['easy'] ?? 0) + (submitted['medium'] ?? 0) + (submitted['hard'] ?? 0),
    easySubmissions: submitted['easy'] ?? 0,
    mediumSubmissions: submitted['medium'] ?? 0,
    hardSubmissions: submitted['hard'] ?? 0,
  };
}

export interface ProblemSubmission {
  problemUrl: string;
  titleSlug: string;
  submissionId: string;
  status: string;
  lang: string;
  runtime: string;
  memory: string;
  timestamp: string;
  code: string;
}

interface RawSubmissionItem {
  id: string;
  statusDisplay: string;
  lang: string;
  runtime: string;
  memory: string;
  timestamp: string;
}

async function listSubmissions(titleSlug: string, limit = 10): Promise<RawSubmissionItem[]> {
  const listQuery = `
    query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
      submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
        submissions {
          id
          statusDisplay
          lang
          runtime
          memory
          timestamp
        }
      }
    }
  `;
  const listData = (await gql(listQuery, { offset: 0, limit, questionSlug: titleSlug })) as {
    submissionList: { submissions: RawSubmissionItem[] };
  };
  return listData.submissionList?.submissions ?? [];
}

export async function getLatestProblemSubmission(titleSlug: string, problemUrl: string): Promise<ProblemSubmission> {
  const submissions = await listSubmissions(titleSlug, 1);
  if (submissions.length === 0) {
    throw new Error(`No submissions found for problem: ${titleSlug}`);
  }
  const latest = submissions[0]!;

  const detailQuery = `
    query submissionDetail($id: ID!) {
      submissionDetail(submissionId: $id) {
        code
      }
    }
  `;
  const detailData = (await gql(detailQuery, { id: latest.id })) as {
    submissionDetail: { code: string };
  };

  return {
    problemUrl,
    titleSlug,
    submissionId: latest.id,
    status: latest.statusDisplay,
    lang: latest.lang,
    runtime: latest.runtime,
    memory: latest.memory,
    timestamp: new Date(parseInt(latest.timestamp, 10) * 1000).toISOString(),
    code: detailData.submissionDetail.code,
  };
}

// ── Problem Summary (aggregated) ─────────────────────────────────────────────

export type ProblemStatus = 'Solved' | 'Tried' | 'Unsolved';

export interface ProblemSummary {
  problem: string;
  link: string;
  difficulty: string;
  tags: string[];
  status: ProblemStatus;
  description: string;
  useCases: string[];
  code: string | null;
  submissionInfo: { id: string; lang: string; runtime: string; memory: string; timestamp: string } | null;
  analysis: string;
}

/** Strip HTML tags and normalise whitespace */
export function stripHtml(html: string): string {
  return html
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n$1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract example blocks from HTML content */
export function extractUseCases(html: string): string[] {
  const cases: string[] = [];
  const preBlocks = html.match(/<pre>([\s\S]*?)<\/pre>/gi) ?? [];
  for (const block of preBlocks) {
    const text = stripHtml(block).trim();
    if (text) cases.push(text);
  }
  // fallback: look for "Example N:" pattern in stripped text
  if (cases.length === 0) {
    const stripped = stripHtml(html);
    const matches = stripped.match(/Example\s*\d+:[\s\S]*?(?=Example\s*\d+:|Constraints:|$)/gi) ?? [];
    cases.push(...matches.map((m) => m.trim()));
  }
  return cases;
}

/** Derive Solved/Tried/Unsolved from a list of submissions */
function deriveStatus(submissions: RawSubmissionItem[]): ProblemStatus {
  if (submissions.length === 0) return 'Unsolved';
  if (submissions.some((s) => s.statusDisplay === 'Accepted')) return 'Solved';
  return 'Tried';
}

export async function getProblemSummary(
  problemUrl: string,
  analysisFn?: (title: string, difficulty: string, description: string, code: string, lang: string) => Promise<string>,
  onProgress?: (msg: string) => void,
): Promise<ProblemSummary> {
  const titleSlug = slugFromUrl(problemUrl);

  // Fetch problem detail and submissions in parallel
  onProgress?.('⏳ Fetching problem details and submissions...');
  const [problem, submissions] = await Promise.all([
    getProblemDetail(titleSlug),
    listSubmissions(titleSlug, 10),
  ]);
  onProgress?.(`✅ Problem fetched: ${problem.title} (${problem.difficulty})`);

  const status = deriveStatus(submissions);
  const description = stripHtml(problem.content ?? '');
  const useCases = extractUseCases(problem.content ?? '');

  let code: string | null = null;
  let submissionInfo: ProblemSummary['submissionInfo'] = null;
  let analysis = '';

  // Get latest accepted submission code (or latest if none accepted)
  const latestAccepted = submissions.find((s) => s.statusDisplay === 'Accepted') ?? submissions[0];
  if (latestAccepted) {
    onProgress?.('⏳ Fetching latest submission code...');
    const detailQuery = `
      query submissionDetail($id: ID!) {
        submissionDetail(submissionId: $id) { code }
      }
    `;
    const detailData = (await gql(detailQuery, { id: latestAccepted.id })) as {
      submissionDetail: { code: string };
    };
    code = detailData.submissionDetail.code;
    submissionInfo = {
      id: latestAccepted.id,
      lang: latestAccepted.lang,
      runtime: latestAccepted.runtime,
      memory: latestAccepted.memory,
      timestamp: new Date(parseInt(latestAccepted.timestamp, 10) * 1000).toISOString(),
    };
    onProgress?.(`✅ Code fetched (${latestAccepted.lang}, ${latestAccepted.runtime}, ${latestAccepted.memory})`);

    if (analysisFn && code) {
      onProgress?.('⏳ Analyzing code with AI...');
      analysis = await analysisFn(problem.title, problem.difficulty, description, code, latestAccepted.lang);
      onProgress?.('✅ AI analysis complete');
    }
  }

  return {
    problem: problem.title,
    link: problemUrl,
    difficulty: problem.difficulty,
    tags: problem.topicTags.map((t) => t.name),
    status,
    description,
    useCases,
    code,
    submissionInfo,
    analysis,
  };
}

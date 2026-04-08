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

export async function getLatestProblemSubmission(titleSlug: string, problemUrl: string): Promise<ProblemSubmission> {
  // Step 1: list submissions for this problem, take the first (latest)
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
  const listData = (await gql(listQuery, { offset: 0, limit: 1, questionSlug: titleSlug })) as {
    submissionList: {
      submissions: {
        id: string;
        statusDisplay: string;
        lang: string;
        runtime: string;
        memory: string;
        timestamp: string;
      }[];
    };
  };

  const submissions = listData.submissionList?.submissions;
  if (!submissions || submissions.length === 0) {
    throw new Error(`No submissions found for problem: ${titleSlug}`);
  }
  const latest = submissions[0]!;

  // Step 2: fetch the submission detail to get the code
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

export type AgentState = 'idle' | 'working' | 'completed' | 'briefing' | 'meeting' | 'approval' | 'blocked';
export type Agent = { state: AgentState; task?: string | null; say?: string | null; since?: string; heartbeat?: string; intendedRoom?: string | null; voice?: string | null; directiveAt?: string | null };
export type TaskStatus = 'planned' | 'in_progress' | 'review' | 'blocked' | 'done';
export type Task = { id: string; title: string; owner: string; status: TaskStatus; files?: string[]; verified?: boolean; updated?: string; started?: string; note?: string };
export type PlanStatus = 'awaiting-approval' | 'approved' | 'changes-requested' | 'rejected';
export type Plan = { status: PlanStatus; title: string; scope: string; risks: string[]; tasks: { id: string; title: string; owner: string; files: string[] }[]; created?: string; decidedAt?: string; note?: string };
export type Approval = { id: string; title: string; risk: 'low' | 'med' | 'high'; reason: string; status: 'pending' | 'approved' | 'rejected' | 'discuss'; created: string; decidedAt?: string; note?: string; agent?: string };
export type Project = { slug: string; agents: Record<string, Agent>; tasks: Task[]; plan: Plan | null; approvals: Approval[]; mission: { title?: string; summary?: string; goals?: string[] } | null };
export type RegistryProject = { slug: string; name: string; path: string };
export type SatoruEvent = { ts: string; agent: string | null; type: string; project: string | null; payload: Record<string, unknown> };
export type AppState = {
  config: { activeProject: string | null; projectsRoot?: string };
  registry: { projects: RegistryProject[] };
  activeProject: string | null;
  project: Project | null;
  telemetry: { lastEventTs: string | null; liveSession: boolean };
  serverTime: string;
};

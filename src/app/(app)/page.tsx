import { Board } from "@/components/board/board";
import { NewTaskDialog } from "@/components/board/new-task-dialog";
import { requireProfile } from "@/lib/auth";
import { getBoardData } from "@/lib/board";

export default async function BoardPage() {
  const profile = await requireProfile();
  const { tasks, people } = await getBoardData();

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Board</h1>
        {profile.role === "manager" && <NewTaskDialog people={people} />}
      </div>
      <Board tasks={tasks} people={people} me={{ id: profile.id, role: profile.role }} />
    </main>
  );
}

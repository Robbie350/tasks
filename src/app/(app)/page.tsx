import { Board } from "@/components/board/board";
import { NewTaskDialog } from "@/components/board/new-task-dialog";
import { requireProfile } from "@/lib/auth";
import { getBoardData } from "@/lib/board";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const profile = await requireProfile();
  const { tasks, people, unreadTaskIds, labels, archivedCount } = await getBoardData();
  const openTaskId = (await searchParams).task;

  return (
    <main className="p-4 sm:p-6">
      <Board
        tasks={tasks}
        people={people}
        me={{ id: profile.id, role: profile.role }}
        unreadTaskIds={unreadTaskIds}
        labels={labels}
        archivedCount={archivedCount}
        initialOpenId={openTaskId && tasks.some((x) => x.id === openTaskId) ? openTaskId : undefined}
        toolbarEnd={profile.role === "manager" ? <NewTaskDialog people={people} labels={labels} /> : null}
      />
    </main>
  );
}

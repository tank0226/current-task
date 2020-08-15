/** @typedef { import("../types/TaskData").TaskData } TaskData */

const moment = require("moment");

const TasksStateCalculator = require("./TasksStateCalculator");

const tasksStateCalculator = new TasksStateCalculator();

/** @type {TaskData[]} */
let relevantTasks;

describe("TasksStateCalculator", () => {
    describe("calculateTasksState", () => {
        it("handles a situation with no relevant tasks", () => {
            relevantTasks = [];

            const tasksState = tasksStateCalculator.calculateTasksState(relevantTasks, moment());

            expect(tasksState.numberOverdueWithTime).toBe(0);
            expect(tasksState.numberOverdueWithTimeMarkedCurrent).toBe(0);
            expect(tasksState.numberOverdueWithTimeNotMarkedCurrent).toBe(0);
            expect(tasksState.numberMarkedCurrent).toBe(0);
            expect(tasksState.currentTaskTitle).toBe("");
            expect(tasksState.currentTaskHasDate).toBe(false);
            expect(tasksState.currentTaskHasTime).toBe(false);
            expect(tasksState.currentTaskIsOverdue).toBe(false);
        });

        it("sets the current task info if there is exactly one current task", () => {
            const taskTitle = "taskTitle";
            const now = moment("2020-08-15 18:15:00");

            relevantTasks = [
                {
                    title: taskTitle,
                    dueDate: "2020-08-14",
                    dueDatetime: undefined,
                    markedCurrent: true,
                },
            ];

            const tasksState = tasksStateCalculator.calculateTasksState(relevantTasks, now);

            expect(tasksState.numberOverdueWithTime).toBe(0);
            expect(tasksState.numberOverdueWithTimeMarkedCurrent).toBe(0);
            expect(tasksState.numberOverdueWithTimeNotMarkedCurrent).toBe(0);
            expect(tasksState.numberMarkedCurrent).toBe(1);
            expect(tasksState.currentTaskTitle).toBe(taskTitle);
            expect(tasksState.currentTaskHasDate).toBe(true);
            expect(tasksState.currentTaskHasTime).toBe(false);
            expect(tasksState.currentTaskIsOverdue).toBe(true);
        });

        it("doesn't set current task info if there is more than task marked current", () => {
            const now = moment("2020-08-15 18:15:00");

            relevantTasks = [
                {
                    title: "Test1",
                    dueDate: "2020-08-14",
                    dueDatetime: undefined,
                    markedCurrent: true,
                },
                {
                    title: "Test2",
                    dueDate: "2020-08-14",
                    dueDatetime: undefined,
                    markedCurrent: true,
                },
            ];

            const tasksState = tasksStateCalculator.calculateTasksState(relevantTasks, now);

            expect(tasksState.numberOverdueWithTime).toBe(0);
            expect(tasksState.numberOverdueWithTimeMarkedCurrent).toBe(0);
            expect(tasksState.numberOverdueWithTimeNotMarkedCurrent).toBe(0);
            expect(tasksState.numberMarkedCurrent).toBe(2);
            expect(tasksState.currentTaskTitle).toBe("");
            expect(tasksState.currentTaskHasDate).toBe(false);
            expect(tasksState.currentTaskHasTime).toBe(false);
            expect(tasksState.currentTaskIsOverdue).toBe(false);
        });

        it("correctly calculates whether a datetime is overdue", () => {
            const now = moment("2020-08-15 18:15:00");

            relevantTasks = [
                {
                    title: "Test1",
                    dueDate: undefined,
                    dueDatetime: undefined,
                    markedCurrent: true,
                },
                {
                    title: "Test2",
                    dueDate: "2020-08-15",
                    dueDatetime: moment(now).subtract(1, "minutes"),
                    markedCurrent: true,
                },
                {
                    title: "Test3",
                    dueDate: "2020-08-15",
                    dueDatetime: moment(now).add(1, "minutes"),
                    markedCurrent: true,
                },
                {
                    title: "Test4",
                    dueDate: "2020-08-14",
                    dueDatetime: moment(now).subtract(1, "days"),
                    markedCurrent: false,
                },
                {
                    title: "Test5",
                    dueDate: "2020-08-14",
                    dueDatetime: undefined,
                    markedCurrent: false,
                },
            ];

            const tasksState = tasksStateCalculator.calculateTasksState(relevantTasks, now);

            expect(tasksState.numberOverdueWithTime).toBe(2);
            expect(tasksState.numberOverdueWithTimeMarkedCurrent).toBe(1);
            expect(tasksState.numberOverdueWithTimeNotMarkedCurrent).toBe(1);
            expect(tasksState.numberMarkedCurrent).toBe(3);
            expect(tasksState.currentTaskTitle).toBe("");
            expect(tasksState.currentTaskHasDate).toBe(false);
            expect(tasksState.currentTaskHasTime).toBe(false);
            expect(tasksState.currentTaskIsOverdue).toBe(false);
        });
    });
});

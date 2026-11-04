var { validateTask } = require('./validation');
var Task = require('../models/task');
var User = require('../models/user');
var mongoose = require('mongoose');


function taskError(status, message) {
    var error = new Error(message);
    error.statusCode = status;
    return error;
}

async function saveTask(req, res, isUpdate) {
    if (isUpdate && !mongoose.isObjectIdOrHexString(req.params.id)) {
        return res.status(404).json({
            message: "Task not found",
            data: {}
        });
    }

    try {
        var body = req.body || {};

        var task = await mongoose.connection.transaction(async function (session) {
            var currentTask = null;

            if (isUpdate) {
                currentTask = await Task.findById(req.params.id).session(session);

                if (!currentTask) {
                    throw taskError(404, "Task not found");
                }
            }

            var validationError = validateTask(body);

            if (validationError) {
                throw taskError(400, validationError);
            }

            var assignedUser = body.assignedUser !== undefined
                ? body.assignedUser
                : "";

            var assignedUserName = "unassigned";

            if (assignedUser !== "") {
                var user = await User.findById(assignedUser).session(session);

                if (!user) {
                    throw taskError(404, "Assigned user not found");
                }

                assignedUserName = user.name;
            }

            if (body.assignedUserName !== undefined &&
                body.assignedUserName !== assignedUserName) {
                throw taskError(400, "assignedUserName does not match assignedUser");
            }

            var oldAssignedUser = currentTask ? currentTask.assignedUser : "";

            if (!currentTask) {
                currentTask = new Task();
            }

            currentTask.name = body.name;
            currentTask.description = body.description !== undefined
                ? body.description
                : "";
            currentTask.deadline = body.deadline;
            currentTask.completed = body.completed !== undefined
                ? body.completed
                : false;
            currentTask.assignedUser = assignedUser;
            currentTask.assignedUserName = assignedUserName;

            await currentTask.save({ session });

            var taskId = currentTask._id.toString();

            if (oldAssignedUser !== "") {
                await User.updateOne(
                    { _id: oldAssignedUser },
                    { $pull: { pendingTasks: taskId } },
                    { session }
                );
            }

            if (assignedUser !== "" && !currentTask.completed) {
                await User.updateOne(
                    { _id: assignedUser },
                    { $addToSet: { pendingTasks: taskId } },
                    { session }
                );
            }

            return currentTask;
        });

        return res.status(isUpdate ? 200 : 201).json({
            message: isUpdate ? "Task updated" : "Task created",
            data: task
        });

    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message,
                data: {}
            });
        }

        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({
                message: "Invalid task data",
                data: {}
            });
        }

        return res.status(500).json({
            message: "Unable to save task",
            data: {}
        });
    }
}

module.exports = function (router) {
    var tasksRoute = router.route('/tasks');
    var taskRoute = router.route('/tasks/:id');

    // GET all tasks
    tasksRoute.get(async function (req, res) {
        try {
            var where = req.query.where ? JSON.parse(req.query.where) : {};
            var sort = req.query.sort ? JSON.parse(req.query.sort) : {};
            var select = req.query.select ? JSON.parse(req.query.select) : {};
            var skip = req.query.skip !== undefined ? JSON.parse(req.query.skip) : 0;
            var limit = req.query.limit !== undefined ? JSON.parse(req.query.limit) : 100;
            var count = req.query.count !== undefined ? JSON.parse(req.query.count) : false;

            // Validate query parameter types.
            var validObject = function (value) {
                return value !== null && typeof value === "object" && !Array.isArray(value);
            };

            if (!validObject(where) || !validObject(sort) || !validObject(select) ||
                !Number.isInteger(skip) || skip < 0 ||
                !Number.isInteger(limit) || limit < 0 ||
                typeof count !== "boolean") {
                return res.status(400).json({
                    message: "Invalid query parameters",
                    data: {}
                });
            }

            if (count) {
                var total = await Task.countDocuments(where);

                return res.status(200).json({
                    message: "OK",
                    data: total
                });
            }

            var tasks = limit === 0 ? [] : await Task.find(where)
                .sort(sort)
                .select(select)
                .skip(skip)
                .limit(limit);

            return res.status(200).json({
                message: "OK",
                data: tasks
            });

        } catch (error) {
            if (error instanceof SyntaxError || error.name === "CastError") {
                return res.status(400).json({
                    message: "Invalid query parameters",
                    data: {}
                });
            }

            return res.status(500).json({
                message: "Unable to retrieve tasks",
                data: []
            });
        }
    });


    // POST a new task
    tasksRoute.post(async function (req, res) {
        return saveTask(req, res, false);
    });

    
    // GET one task
    taskRoute.get(async function (req, res) {
        try {
            if (!mongoose.isObjectIdOrHexString(req.params.id)) {
                return res.status(404).json({
                    message: "Task not found",
                    data: {}
                });
            }
            
        var select = {};
        if (req.query.select !== undefined) {
            try {
                select = JSON.parse(req.query.select);

                if (select === null ||
                    typeof select !== "object" ||
                    Array.isArray(select)) {
                    throw new SyntaxError("Invalid select");
                }
            } catch (error) {
                return res.status(400).json({
                    message: "Invalid select parameter",
                    data: {}
                });
            }
        }

        var task = await Task.findById(req.params.id).select(select);


            if (!task) {
                return res.status(404).json({
                    message: "Task not found",
                    data: {}
                });
            }

            return res.status(200).json({
                message: "OK",
                data: task
            });
        } catch (error) {
            return res.status(500).json({
                message: "Unable to retrieve task",
                data: {}
            });
        }
    });

    // PUT: replace a task's editable fields
    taskRoute.put(async function (req, res) {
        return saveTask(req, res, true);
    });

    // DELETE a task
    taskRoute.delete(async function (req, res) {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(404).json({
                message: "Task not found",
                data: {}
            });
        }

        try {
            var task = await mongoose.connection.transaction(async function (session) {
                var existingTask = await Task.findById(req.params.id).session(session);

                if (!existingTask) {
                    throw taskError(404, "Task not found");
                }

                if (existingTask.assignedUser !== "") {
                    await User.updateOne(
                        { _id: existingTask.assignedUser },
                        { $pull: { pendingTasks: existingTask._id.toString() } },
                        { session }
                    );
                }

                await Task.deleteOne(
                    { _id: existingTask._id },
                    { session }
                );

                return existingTask;
            });

            return res.status(200).json({
                message: "Task deleted",
                data: task
            });

        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    data: {}
                });
            }

            return res.status(500).json({
                message: "Unable to delete task",
                data: {}
            });
        }
    });


    return router;
};
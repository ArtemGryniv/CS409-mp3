
var User = require('../models/user');
var Task = require('../models/task');
var mongoose = require('mongoose');
var { validateUser } = require('./validation');

function userError(status, message) {
    var error = new Error(message);
    error.statusCode = status;
    return error;
}

function sendUserError(res, error, action) {
    if (error.statusCode) {
        return res.status(error.statusCode).json({
            message: error.message,
            data: {}
        });
    }

    if (error.code === 11000) {
        return res.status(400).json({
            message: "Email is already in use",
            data: {}
        });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
        return res.status(400).json({
            message: "Invalid user data",
            data: {}
        });
    }

    return res.status(500).json({
        message: "Unable to " + action + " user",
        data: {}
    });
}

// Handles both POST and PUT user requests.
async function saveUser(req, res, isUpdate) {
    if (isUpdate && !mongoose.isObjectIdOrHexString(req.params.id)) {
        return res.status(404).json({
            message: "User not found",
            data: {}
        });
    }

    try {
        var user = await mongoose.connection.transaction(async function (session) {
            var currentUser = null;

            if (isUpdate) {
                currentUser = await User.findById(req.params.id).session(session);

                if (!currentUser) {
                    throw userError(404, "User not found");
                }
            }

            var body = req.body || {};
            var validationError = validateUser(body);
            if (validationError) {
                throw userError(400, validationError);
            }

            var requestedIds = (body.pendingTasks || []).map(function (id) {
                return id.toLowerCase();
            });

            if (new Set(requestedIds).size !== requestedIds.length) {
                throw userError(400, "Duplicate task IDs are not allowed");
            }
            var emailQuery = { email: body.email };

            if (isUpdate) {
                emailQuery._id = { $ne: currentUser._id };
            }

            if (await User.findOne(emailQuery).session(session)) {
                throw userError(400, "Email is already in use");
            }

            var referencedTasks = await Task.find({
                _id: { $in: requestedIds }
            }).session(session);

            if (referencedTasks.some(function (task) {
                return task.completed;
            })) {
                throw userError(400, "Completed tasks cannot be pending");
            }

            if (referencedTasks.length !== requestedIds.length) {
                throw userError(404, "One or more tasks were not found");
            }

            var oldIds = currentUser
                ? currentUser.pendingTasks.map(function (id) {
                    return id.toLowerCase();
                })
                : [];

            var newIdSet = new Set(requestedIds);
            if (!currentUser) {
                currentUser = new User();
            }

            currentUser.name = body.name;
            currentUser.email = body.email;
            currentUser.pendingTasks = requestedIds;

            await currentUser.save({ session: session });

            var userId = currentUser._id.toString();

            for (var oldTaskId of oldIds) {
                if (!newIdSet.has(oldTaskId)) {
                    await Task.updateOne(
                        {
                            _id: oldTaskId,
                            assignedUser: userId
                        },
                        {
                            $set: {
                                assignedUser: "",
                                assignedUserName: "unassigned"
                            }
                        },
                        { session: session }
                    );
                }
            }

            // Assign every requested pending task to this user.
            for (var task of referencedTasks) {
                var taskId = task._id.toString();
                var previousUserId = task.assignedUser;

                // If another user owned it, remove their reference.
                if (previousUserId !== "" && previousUserId !== userId) {
                    await User.updateOne(
                        { _id: previousUserId },
                        { $pull: { pendingTasks: taskId } },
                        { session: session }
                    );
                }

                await Task.updateOne(
                    { _id: task._id },
                    {
                        $set: {
                            assignedUser: userId,
                            assignedUserName: body.name
                        }
                    },
                    { session: session }
                );
            }

            // Update assignedUserName for all tasks belonging to this user, including completed tasks.
            await Task.updateMany(
                { assignedUser: userId },
                { $set: { assignedUserName: body.name } },
                { session: session }
            );

            return currentUser;
        });

        return res.status(isUpdate ? 200 : 201).json({
            message: isUpdate ? "User updated" : "User created",
            data: user
        });

    } catch (error) {
        return sendUserError(res, error, "save");
    }
}

module.exports = function (router) {
    var usersRoute = router.route('/users');
    var userRoute = router.route('/users/:id');

    // GET all users
    usersRoute.get(async function (req, res) {
        try {
            var where = req.query.where ? JSON.parse(req.query.where) : {};
            var sort = req.query.sort ? JSON.parse(req.query.sort) : {};
            var select = req.query.select ? JSON.parse(req.query.select) : {};
            var skip = req.query.skip !== undefined ? JSON.parse(req.query.skip) : 0;
            var limit = req.query.limit !== undefined ? JSON.parse(req.query.limit) : null;
            var count = req.query.count !== undefined ? JSON.parse(req.query.count) : false;

            var validObject = function (value) {
                return value !== null &&
                    typeof value === "object" &&
                    !Array.isArray(value);
            };

            if (!validObject(where) || !validObject(sort) || !validObject(select) ||
                !Number.isInteger(skip) || skip < 0 ||
                (limit !== null && (!Number.isInteger(limit) || limit < 0)) ||
                typeof count !== "boolean") {
                return res.status(400).json({
                    message: "Invalid query parameters",
                    data: {}
                });
            }

            if (count) {
                var total = await User.countDocuments(where);

                return res.status(200).json({
                    message: "OK",
                    data: total
                });
            }

            if (limit === 0) {
                return res.status(200).json({
                    message: "OK",
                    data: []
                });
            }

            var query = User.find(where)
                .sort(sort)
                .select(select)
                .skip(skip);

            if (limit !== null) {
                query = query.limit(limit);
            }

            var users = await query;

            return res.status(200).json({
                message: "OK",
                data: users
            });

        } catch (error) {
            if (error instanceof SyntaxError || error.name === "CastError") {
                return res.status(400).json({
                    message: "Invalid query parameters",
                    data: {}
                });
            }

            return res.status(500).json({
                message: "Unable to retrieve users",
                data: []
            });
        }
    });

    // POST a new user
    usersRoute.post(async function (req, res) {
        return saveUser(req, res, false);
    });

    // GET one user
    userRoute.get(async function (req, res) {
        try {
            if (!mongoose.isObjectIdOrHexString(req.params.id)) {
                return res.status(404).json({
                    message: "User not found",
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

            var user = await User.findById(req.params.id).select(select);

            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            return res.status(200).json({
                message: "OK",
                data: user
            });

        } catch (error) {
            return res.status(500).json({
                message: "Unable to retrieve user",
                data: {}
            });
        }
    });

    // PUT: replace a user and synchronize assigned tasks.
    userRoute.put(async function (req, res) {
        return saveUser(req, res, true);
    });

    // DELETE a user and unassign all their tasks.
    userRoute.delete(async function (req, res) {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(404).json({
                message: "User not found",
                data: {}
            });
        }

        try {
            var deletedUser = await mongoose.connection.transaction(async function (session) {
                var user = await User.findById(req.params.id).session(session);

                if (!user) {
                    throw userError(404, "User not found");
                }

                // Unassign both completed and incomplete tasks.
                await Task.updateMany(
                    { assignedUser: user._id.toString() },
                    {
                        $set: {
                            assignedUser: "",
                            assignedUserName: "unassigned"
                        }
                    },
                    { session: session }
                );

                await User.deleteOne(
                    { _id: user._id },
                    { session: session }
                );

                return user;
            });

            return res.status(204).send();

        } catch (error) {
            return sendUserError(res, error, "delete");
        }
    });

    return router;
};

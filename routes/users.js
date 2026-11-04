var { validateUser } = require('./validation');
var User = require('../models/user');
var mongoose = require('mongoose');

module.exports = function (router) {
    var usersRoute = router.route('/users');
    var userRoute = router.route('/users/:id');

    
    usersRoute.get(async function (req, res) {
        try {
            var where = req.query.where ? JSON.parse(req.query.where) : {};
            var sort = req.query.sort ? JSON.parse(req.query.sort) : {};
            var select = req.query.select ? JSON.parse(req.query.select) : {};
            var skip = req.query.skip !== undefined ? JSON.parse(req.query.skip) : 0;
            var limit = req.query.limit !== undefined ? JSON.parse(req.query.limit) : null;
            var count = req.query.count !== undefined ? JSON.parse(req.query.count) : false;

            var validObject = function (value) {
                return value !== null && typeof value === "object" && !Array.isArray(value);
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

            var query = User.find(where)
                .sort(sort)
                .select(select)
                .skip(skip);

            if (limit !== null) {
                if (limit === 0) {
                    return res.status(200).json({
                        message: "OK",
                        data: []
                    });
                }

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


    usersRoute.post(async function (req, res) {
        try {
            var body = req.body || {};
            var validationError = validateUser(body);

            if (validationError) {
                return res.status(400).json({
                    message: validationError,
                    data: {}
                });
            }

            var user = new User({
                name: body.name,
                email: body.email,
                pendingTasks: []
            });

            await user.save();

            return res.status(201).json({
                message: "User created",
                data: user
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(400).json({
                    message: "Email is already in use",
                    data: {}
                });
            }

            if (error.name === "ValidationError") {
                return res.status(400).json({
                    message: "A valid name and email are required",
                    data: {}
                });
            }

            return res.status(500).json({
                message: "Unable to create user",
                data: {}
            });
        }
    });

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

    userRoute.put(async function (req, res) {
        try {
            if (!mongoose.isObjectIdOrHexString(req.params.id)) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            var validationError = validateUser(body);
            if (validationError) {
                return res.status(400).json({
                    message: validationError,
                    data: {}
                });
            }

            var body = req.body || {};
            user.name = body.name;
            user.email = body.email;
            user.pendingTasks = [];

            await user.save();

            return res.status(200).json({
                message: "User updated",
                data: user
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(400).json({
                    message: "Email is already in use",
                    data: {}
                });
            }

            if (error.name === "ValidationError") {
                return res.status(400).json({
                    message: "A valid name and email are required",
                    data: {}
                });
            }

            return res.status(500).json({
                message: "Unable to update user",
                data: {}
            });
        }
    });

    userRoute.delete(async function (req, res) {
        try {
            if (!mongoose.isObjectIdOrHexString(req.params.id)) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            var user = await User.findByIdAndDelete(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    data: {}
                });
            }

            return res.status(200).json({
                message: "User deleted",
                data: user
            });
        } catch (error) {
            return res.status(500).json({
                message: "Unable to delete user",
                data: {}
            });
        }
    });

    return router
};


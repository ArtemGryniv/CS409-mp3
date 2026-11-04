
var mongoose = require('mongoose');

function validateUser(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Invalid user data";
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
        return "A valid name is required";
    }

    if (typeof body.email !== "string" || !body.email.trim()) {
        return "A valid email is required";
    }

    if (body.pendingTasks !== undefined) {
        if (!Array.isArray(body.pendingTasks)) {
            return "pendingTasks must be an array";
        }

        for (var id of body.pendingTasks) {
            if (typeof id !== "string" ||
                !mongoose.isObjectIdOrHexString(id)) {
                return "Invalid task ID in pendingTasks";
            }
        }

        if (new Set(body.pendingTasks).size !== body.pendingTasks.length) {
            return "Duplicate task IDs are not allowed";
        }
    }

    return null;
}

function validateTask(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Invalid task data";
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
        return "A valid task name is required";
    }

    if (typeof body.deadline !== "string" ||
        !body.deadline.trim() ||
        Number.isNaN(Date.parse(body.deadline))) {
        return "A valid deadline is required";
    }

    if (body.description !== undefined &&
        typeof body.description !== "string") {
        return "Description must be a string";
    }

    if (body.completed !== undefined &&
        typeof body.completed !== "boolean") {
        return "Completed must be a boolean";
    }

    if (body.assignedUser !== undefined) {
        if (typeof body.assignedUser !== "string" ||
            (body.assignedUser !== "" &&
            !mongoose.isObjectIdOrHexString(body.assignedUser))) {
            return "Invalid assignedUser ID";
        }
    }

    if (body.assignedUserName !== undefined &&
        typeof body.assignedUserName !== "string") {
        return "assignedUserName must be a string";
    }

    return null;
}

module.exports = {
    validateUser,
    validateTask
};

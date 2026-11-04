var mongoose = require('mongoose');

var taskSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    description: {
        type: String,
        default: ""
    },

    deadline: {
        type: Date,
        required: true
    },

    assignedUser: {
        type: String,
        default: ""
    },

    assignedUserName: { 
        type: String,
        default: "unassigned"
    },

    dateCreated: {
        type: Date,
        default: Date.now
    },

    completed: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Task', taskSchema);
const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    activityType: {
      type: String,
      enum: ["task", "meeting", "call"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      default: "Pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    startDateTime: {
      type: Date,
      index: true,
    },
    endDateTime: Date,
    location: {
      type: String,
      trim: true,
      default: "",
    },
    participants: [
      {
        type: String,
        trim: true,
      },
    ],
    reminderTime: Date,
    reminderChannels: {
      popup: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },
    recurrence: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    relatedTo: {
      recordType: {
        type: String,
        enum: ["Lead", "Contact", "Deal"],
        required: true,
        index: true,
      },
      recordId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "relatedTo.recordType",
        index: true,
      },
      recordName: {
        type: String,
        default: "",
        trim: true,
      },
    },
    task: {
      taskTitle: String,
    },
    meeting: {
      meetingTitle: String,
      reminder: Date,
    },
    call: {
      callSubject: String,
      callType: {
        type: String,
        enum: ["Inbound", "Outbound"],
      },
      callDuration: {
        type: Number,
        default: 0,
      },
      callNotes: {
        type: String,
        default: "",
      },
      callStatus: {
        type: String,
        enum: ["Scheduled", "Completed"],
      },
    },
    completedAt: Date,
    cancelledAt: Date,
    notificationState: {
      popupNotifiedAt: Date,
      emailNotifiedAt: Date,
    },
  },
  {
    timestamps: true,
    collection: "activities",
  }
);

module.exports = mongoose.model("Activity", activitySchema);

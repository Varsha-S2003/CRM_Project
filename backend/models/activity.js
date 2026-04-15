const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      index: true,
    },
    type: {
      type: String,
      enum: ["call", "email", "meeting", "task"],
      lowercase: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    nextFollowUpDate: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    activityType: {
      type: String,
      enum: ["task", "meeting", "call", "email"],
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
        enum: ["Scheduled", "Ringing", "In Progress", "Missed", "Completed"],
      },
      provider: {
        type: String,
        default: "",
      },
      providerCallSid: {
        type: String,
        default: "",
        index: true,
      },
      providerStatus: {
        type: String,
        default: "",
      },
      toNumber: {
        type: String,
        default: "",
      },
      fromNumber: {
        type: String,
        default: "",
      },
      teamsLink: {
        type: String,
        default: "",
      },
      teamsMode: {
        type: String,
        enum: ["voice", "video", ""],
        default: "",
      },
    },
    outcome: {
      type: String,
      enum: ["interested", "not_interested", "no_response", "follow_up_needed", ""],
      default: "",
      index: true,
    },
    outcomeReason: {
      type: String,
      trim: true,
      default: "",
    },
    requiresFollowUp: {
      type: Boolean,
      default: false,
      index: true,
    },
    stage: {
      type: String,
      enum: ["contacted", "meeting", "qualified", ""],
      default: "",
      index: true,
    },
    followUpType: {
      type: String,
      enum: ["task", "meeting", "call", ""],
      default: "",
    },
    followUpInDays: {
      type: Number,
      min: 1,
      max: 30,
      default: 1,
    },
    followUpGeneratedAt: {
      type: Date,
      default: null,
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

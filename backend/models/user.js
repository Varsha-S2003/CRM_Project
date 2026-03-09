const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: false
  },
  department: {
    type: String,
    required: false
  },
  designation: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ["ADMIN", "MANAGER", "EMPLOYEE"],
    default: "EMPLOYEE"
  },
  employee_id: {
    type: String,
    unique: true,
    sparse: true // Allows null values but ensures uniqueness when present
  }
}, { timestamps: true });

// Auto-generate employee_id for non-admin users
// when using an async pre hook, Mongoose does not provide a callback, so
// don't declare or call `next`. just await the work and return.
userSchema.pre('save', async function() {
  if (this.isNew && !this.employee_id && this.role !== 'ADMIN') {
    const count = await this.constructor.countDocuments({ role: { $ne: 'ADMIN' } });
    this.employee_id = `EMP-${String(count + 1).padStart(3, '0')}`;
  }
});

module.exports = mongoose.model("User", userSchema);


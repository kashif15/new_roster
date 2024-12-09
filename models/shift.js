const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Employee = require('./employee');

const Shift = sequelize.define('Shift', {
    shifts: {
        type: DataTypes.JSONB,  // Use JSONB to store shift details as a JSON object
        allowNull: false
    },
    month: {
        type: DataTypes.STRING,
        allowNull: false
    },
    year: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

// Foreign key linking to Employee
Shift.belongsTo(Employee, { foreignKey: 'employeeId' });

module.exports = Shift;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogs = exports.restaurantSettings = exports.authorizedDevices = exports.adminCustomers = exports.adminEmployees = exports.adminOrders = exports.adminDeals = exports.adminMenuItems = exports.adminCategories = void 0;
// Initial admin categories start empty (no default "Others")
exports.adminCategories = [];
exports.adminMenuItems = [];
exports.adminDeals = [];
exports.adminOrders = [];
exports.adminEmployees = [];
exports.adminCustomers = [];
exports.authorizedDevices = [];
exports.restaurantSettings = {
    opening_time: '11:00 AM',
    closing_time: '02:00 AM',
    max_cash_limit: '5000',
    delivery_fee: '150',
    min_takeaway_orders: '1',
    starting_cash: '10000',
    maintenance_mode: false,
};
exports.auditLogs = [];

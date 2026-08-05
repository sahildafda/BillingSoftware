import axios from "axios";

const API = axios.create({
    baseURL: "/api",
});

function authHeaders() {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const getInvoices = (params = {}) => API.get("/billing/invoices", { params, headers: authHeaders() });
export const getInvoiceById = (id) => API.get(`/billing/invoices/${id}`, { headers: authHeaders() });
export const getCustomerBalances = (params = {}) => API.get("/billing/customer-balances", { params, headers: authHeaders() });

export default {
    getInvoices,
    getInvoiceById,
    getCustomerBalances,
};

import axios from "axios";

const API = axios.create({
    baseURL: "/api",
});

function authHeaders() {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const getProducts = (params) => API.get("/products", { params, headers: authHeaders() });
export const createProduct = (payload) => API.post("/products", payload, { headers: authHeaders() });
export const updateProduct = (id, payload) => API.put(`/products/${id}`, payload, { headers: authHeaders() });
export const deleteProduct = (id) => API.delete(`/products/${id}`, { headers: authHeaders() });
export const getBarcodeForProduct = (id, params = {}) => API.get(`/products/${id}/barcode`, { params, headers: authHeaders() });

export default {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getBarcodeForProduct,
};

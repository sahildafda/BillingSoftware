import axios from "axios";

const API = axios.create({
    baseURL: "/api",
});

export const registerUser = (payload) => API.post("/auth/register", payload);
export const verifyOtp = (payload) => API.post("/auth/verify-otp", payload);
export const loginUser = (payload) => API.post("/auth/login", payload);
export const forgotPassword = (payload) => API.post("/auth/forgot-password", payload);
export const changePassword = (payload, token) =>
    API.post("/auth/change-password", payload, {
        headers: { Authorization: `Bearer ${token}` },
    });

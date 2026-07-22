import {
    Badge,
    Box,
    VStack,
    Heading,
    Text,
    Checkbox,
    Link,
    HStack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import {
    AppButton,
    AppInput,
    PasswordInput,
    FormLabel,
    DividerText,
} from "../ui";
import { ROUTES } from "../../constants/routes";
import { forgotPassword, loginUser } from "../../services/authService";

export default function LoginForm() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [isResetting, setIsResetting] = useState(false);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setMessage("");
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setMessage("");

        try {
            const { data } = await loginUser(form);
            localStorage.setItem("authToken", data.token);
            localStorage.setItem("authUser", JSON.stringify(data.user));
            navigate(ROUTES.DASHBOARD);
        } catch (error) {
            setMessage(error.response?.data?.message || "Login failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!form.email) {
            setMessage("Enter your email first to reset the password.");
            return;
        }

        setIsResetting(true);
        setMessage("");

        try {
            await forgotPassword({ email: form.email, newPassword: "12345678", confirmPassword: "12345678" });
            setMessage("Password reset request received. Use the new temporary password: 12345678");
        } catch (error) {
            setMessage(error.response?.data?.message || "Unable to reset password right now.");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            minH="100vh"
            px={{ base: 4, lg: 12 }}
            py={{ base: 8, lg: 0 }}
        >
            <Box
                w="100%"
                maxW="440px"
                bg="surface"
                border="1px solid"
                borderColor="border"
                rounded="2xl"
                p={{ base: 6, md: 8 }}
                boxShadow="0 24px 80px rgba(0, 0, 0, 0.35)"
            >
                <Badge
                    colorScheme="orange"
                    bg="rgba(217, 119, 87, 0.16)"
                    color="primary"
                    border="1px solid"
                    borderColor="rgba(217, 119, 87, 0.28)"
                    px={3}
                    py={1}
                    rounded="full"
                >
                    Secure access
                </Badge>

                <Heading color="white" mt={4} size="lg">
                    Welcome back
                </Heading>

                <Text color="gray.400" mt={3} lineHeight="tall">
                    Sign in to keep your billing and inventory workflow moving smoothly.
                </Text>

                <VStack spacing={5} mt={8}>
                    <Box w="100%">
                        <FormLabel required mb={2}>
                            Email address
                        </FormLabel>
                        <AppInput
                            name="email"
                            placeholder="Enter email address"
                            type="email"
                            value={form.email}
                            onChange={handleChange}
                        />
                    </Box>

                    <Box w="100%">
                        <FormLabel required mb={2}>
                            Password
                        </FormLabel>
                        <PasswordInput
                            name="password"
                            placeholder="Enter password"
                            value={form.password}
                            onChange={handleChange}
                        />
                    </Box>

                    <HStack justify="space-between" w="100%" mt={1} color="gray.400">
                        <Checkbox colorScheme="orange" size="md">
                            Remember me
                        </Checkbox>

                        <Link color="primary" fontSize="sm" _hover={{ color: "primaryHover" }} onClick={handleForgotPassword}>
                            {isResetting ? "Resetting..." : "Forgot password?"}
                        </Link>
                    </HStack>

                    {message ? (
                        <Text color="red.300" w="100%">
                            {message}
                        </Text>
                    ) : null}

                    <AppButton w="100%" onClick={handleSubmit} isLoading={isSubmitting} isDisabled={!form.email || !form.password}>
                        Sign In
                    </AppButton>

                    <DividerText />

                    <AppButton
                        w="100%"
                        bg="transparent"
                        border="1px solid"
                        borderColor="border"
                        boxShadow="none"
                        _hover={{
                            bg: "whiteAlpha.100",
                            transform: "translateY(-1px)",
                        }}
                        onClick={() => navigate(ROUTES.REGISTER)}
                    >
                        Create Account
                    </AppButton>
                </VStack>
            </Box>
        </Box>
    );
}
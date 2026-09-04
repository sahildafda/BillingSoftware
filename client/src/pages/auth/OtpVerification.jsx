import { useLocation, useNavigate } from "react-router-dom";
import { Badge, Box, Heading, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";

import { AppButton, AppInput, FormLabel } from "../../components/ui";
import { ROUTES } from "../../constants/routes";
import { verifyOtp } from "../../services/authService";

export default function OtpVerification() {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || "your email";
    const [otp, setOtp] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState("");

    const handleVerify = async () => {
        setIsSubmitting(true);
        setMessage("");

        try {
            const { data } = await verifyOtp({ email, otp });
            localStorage.setItem("authToken", data.token);
            localStorage.setItem("authUser", JSON.stringify(data.user));
            navigate(ROUTES.DASHBOARD);
        } catch (error) {
            setMessage(error.response?.data?.message || "OTP verification failed.");
        } finally {
            setIsSubmitting(false);
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
                boxShadow="0 24px 80px rgba(45, 41, 38, 0.12)"
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
                    Verification
                </Badge>

                <Heading color="text" mt={4} size="lg">
                    Verify your email
                </Heading>

                <Text color="muted" mt={3} lineHeight="tall">
                    We’ve sent a one-time password to {email}. Enter it below to complete registration.
                </Text>

                <VStack spacing={5} mt={8}>
                    <Box w="100%">
                        <FormLabel required mb={2}>OTP</FormLabel>
                        <AppInput
                            placeholder="Enter 6-digit OTP"
                            value={otp}
                            onChange={(event) => setOtp(event.target.value)}
                        />
                    </Box>

                    {message ? <Text color="danger">{message}</Text> : null}

                    <AppButton w="100%" onClick={handleVerify} isLoading={isSubmitting} isDisabled={!otp.trim()}>
                        Verify OTP
                    </AppButton>

                    <Text color="muted" fontSize="sm">
                        Didn’t receive it? <Text as="span" color="primary">Resend code</Text>
                    </Text>
                </VStack>

                <Text mt={6} color="muted" textAlign="center">
                    <Text as="span" color="primary" cursor="pointer" onClick={() => navigate(ROUTES.LOGIN)}>
                        Back to login
                    </Text>
                </Text>
            </Box>
        </Box>
    );
}

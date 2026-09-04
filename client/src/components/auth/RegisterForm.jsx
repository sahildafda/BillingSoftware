import { useState } from "react";
import { Badge, Box, Heading, HStack, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { AppButton, AppInput, FormLabel, PasswordInput } from "../ui";
import { ROUTES } from "../../constants/routes";
import { registerUser } from "../../services/authService";

const steps = ["Company info", "Secure account"];

const initialForm = {
    companyName: "",
    gstNo: "",
    ownerName: "",
    email: "",
    shopAddress: "",
    password: "",
    confirmPassword: "",
};

export default function RegisterForm() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(initialForm);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState("");

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setMessage("");
    };

    const handleNext = async () => {
        if (step === 1) {
            setStep(2);
            return;
        }

        setIsSubmitting(true);
        setMessage("");

        try {
            await registerUser(form);
            navigate(ROUTES.OTP, {
                state: { email: form.email || "your email" },
            });
        } catch (error) {
            setMessage(error.response?.data?.message || "Registration failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isStepOneComplete =
        form.companyName.trim() &&
        form.gstNo.trim() &&
        form.ownerName.trim() &&
        form.email.trim() &&
        form.shopAddress.trim();

    const isStepTwoComplete =
        form.password.trim() &&
        form.confirmPassword.trim() &&
        form.password === form.confirmPassword;

    return (
        <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            minH="100vh"
            px={{ base: 4, lg: 12 }}
            py={{ base: 8, lg: 0 }}
        >
            <Box w="100%" maxW="440px">
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
                    Step {step} of 2
                </Badge>

                <Heading color="text" mt={4} size="lg">
                    Create your account
                </Heading>

                <Text color="muted" mt={3} lineHeight="tall">
                    Register your business and secure your billing workspace in a few simple steps.
                </Text>

                <HStack spacing={3} mt={6} color="muted">
                    {steps.map((item, index) => (
                        <Box
                            key={item}
                            flex={1}
                            py={2}
                            px={3}
                            textAlign="center"
                            rounded="xl"
                            border="1px solid"
                            borderColor={index + 1 === step ? "primary" : "border"}
                            bg={index + 1 === step ? "rgba(217, 119, 87, 0.12)" : "card"}
                            fontSize="sm"
                            color={index + 1 === step ? "primary" : "muted"}
                            as={motion.div}
                            transition={{ duration: 0.3 }}
                        >
                            {item}
                        </Box>
                    ))}
                </HStack>

                <AnimatePresence mode="wait">
                    {step === 1 ? (
                        <motion.div
                            key="step-1"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                            <VStack spacing={5} mt={8}>
                                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5} w="100%">
                                    <Box>
                                        <FormLabel required mb={2}>Company name</FormLabel>
                                        <AppInput name="companyName" value={form.companyName} onChange={handleChange} placeholder="Enter company name" />
                                    </Box>
                                    <Box>
                                        <FormLabel required mb={2}>GST No</FormLabel>
                                        <AppInput name="gstNo" value={form.gstNo} onChange={handleChange} placeholder="Enter GST number" />
                                    </Box>
                                </SimpleGrid>

                                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5} w="100%">
                                    <Box>
                                        <FormLabel required mb={2}>Owner name</FormLabel>
                                        <AppInput name="ownerName" value={form.ownerName} onChange={handleChange} placeholder="Enter owner name" />
                                    </Box>
                                    <Box>
                                        <FormLabel required mb={2}>Email</FormLabel>
                                        <AppInput name="email" type="email" value={form.email} onChange={handleChange} placeholder="Enter email address" />
                                    </Box>
                                </SimpleGrid>

                                <Box w="100%">
                                    <FormLabel required mb={2}>Shop address</FormLabel>
                                    <AppInput name="shopAddress" value={form.shopAddress} onChange={handleChange} placeholder="Enter shop address" />
                                </Box>
                            </VStack>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="step-2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                            <VStack spacing={5} mt={8}>
                                <Box w="100%">
                                    <FormLabel required mb={2}>Password</FormLabel>
                                    <PasswordInput name="password" value={form.password} onChange={handleChange} placeholder="Enter password" />
                                </Box>

                                <Box w="100%">
                                    <FormLabel required mb={2}>Confirm password</FormLabel>
                                    <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Re-enter password" />
                                </Box>
                            </VStack>
                        </motion.div>
                    )}
                </AnimatePresence>

                {message ? (
                    <Text color="danger" mt={4}>
                        {message}
                    </Text>
                ) : null}

                <HStack spacing={3} mt={8}>
                    {step === 2 ? (
                        <AppButton
                            flex={1}
                            bg="transparent"
                            color="text"
                            border="1px solid"
                            borderColor="border"
                            boxShadow="none"
                            _hover={{ bg: "card", transform: "translateY(-1px)" }}
                            onClick={() => setStep(1)}
                        >
                            Back
                        </AppButton>
                    ) : null}

                    <AppButton
                        flex={1}
                        onClick={handleNext}
                        isDisabled={step === 1 ? !isStepOneComplete : !isStepTwoComplete || isSubmitting}
                        isLoading={isSubmitting}
                    >
                        {step === 1 ? "Continue" : "Create Account"}
                    </AppButton>
                </HStack>

                <Text mt={6} color="muted" textAlign="center">
                    Already have an account?{" "}
                    <Link color="primary" onClick={() => navigate(ROUTES.LOGIN)} _hover={{ color: "primaryHover" }}>
                        Sign in
                    </Link>
                </Text>
            </Box>
        </Box>
    );
}

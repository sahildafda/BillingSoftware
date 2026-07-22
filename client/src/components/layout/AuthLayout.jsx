import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";

import Logo from "../ui/Logo";
import AppCard from "../ui/AppCard";

const MotionBox = motion(Box);

export default function AuthLayout({
    title,
    subtitle,
    children,
}) {
    return (
        <Flex
            minH="100vh"
            bg="background"
            align="center"
            justify="center"
            position="relative"
            overflow="hidden"
            px={6}
        >
            {/* Background Glow */}
            <Box
                position="absolute"
                w="700px"
                h="700px"
                bg="primary"
                opacity={0.08}
                filter="blur(180px)"
                rounded="full"
                top="-250px"
            />

            <Box
                position="absolute"
                w="500px"
                h="500px"
                bg="#ffffff"
                opacity={0.03}
                filter="blur(150px)"
                rounded="full"
                bottom="-180px"
                right="-150px"
            />

            <MotionBox
                initial={{
                    opacity: 0,
                    y: 25,
                }}
                animate={{
                    opacity: 1,
                    y: 0,
                }}
                transition={{
                    duration: 0.45,
                }}
                w="100%"
                maxW="460px"
            >
                <AppCard>

                    <Logo />

                    <Heading
                        mt={10}
                        color="white"
                        size="xl"
                    >
                        {title}
                    </Heading>

                    <Text
                        color="muted"
                        mt={2}
                        mb={8}
                    >
                        {subtitle}
                    </Text>

                    {children}

                </AppCard>

                <Text
                    textAlign="center"
                    color="muted"
                    mt={6}
                    fontSize="sm"
                >
                    Billing Software • Version 1.0.0
                </Text>
            </MotionBox>
        </Flex>
    );
}
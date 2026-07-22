import { Box, Heading, Text, VStack } from "@chakra-ui/react";

export default function Dashboard() {
    const user = JSON.parse(localStorage.getItem("authUser") || "null");

    return (
        <Box minH="100vh" bg="background" color="white" p={8}>
            <VStack align="start" spacing={4}>
                <Heading>Welcome back</Heading>
                <Text color="gray.400">
                    {user?.companyName ? `Hello ${user.companyName}` : "Your dashboard is ready."}
                </Text>
                <Text color="gray.400">Authentication is now connected to the SQLite-backed backend.</Text>
            </VStack>
        </Box>
    );
}

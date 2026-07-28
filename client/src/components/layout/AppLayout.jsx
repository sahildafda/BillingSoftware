import { useState } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { useLocation } from "react-router-dom";

import Sidebar from "./Sidebar";

export default function AppLayout({ children }) {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();

    return (
        <Box minH="100vh" bg="background" color="white" p={{ base: 4, md: 6, lg: 0 }}>
            <Flex direction={{ base: "column", lg: "row" }} gap={6} minH="100vh" align={{ lg: "stretch" }}>
                <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((prev) => !prev)} activePath={location.pathname} />

                <Box flex={1} display="flex" flexDirection="column" gap={6} p={{ base: 4, md: 6, lg: 6 }}>
                    {children}
                </Box>
            </Flex>
        </Box>
    );
}
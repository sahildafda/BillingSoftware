import {
    Badge,
    Box,
    Button,
    Heading,
    HStack,
    Icon,
    SimpleGrid,
    Stack,
    Text,
    VStack,
} from "@chakra-ui/react";
import {
    LuBell,
    LuCircleDollarSign,
    LuPackage,
    LuPlus,
    LuReceipt,
    LuSearch,
    LuUsers,
} from "react-icons/lu";
import AppLayout from "../components/layout/AppLayout";

const stats = [
    { label: "Revenue", value: "$24,850", hint: "+12.4% this month", icon: LuCircleDollarSign },
    { label: "Orders", value: "1,284", hint: "42 pending", icon: LuReceipt },
    { label: "Customers", value: "842", hint: "New 18 today", icon: LuUsers },
    { label: "Stock", value: "96%", hint: "Well stocked", icon: LuPackage },
];

const quickActions = [
    "Create invoice",
    "Add product",
    "New customer",
    "Generate report",
];

export default function Dashboard() {
    return (
        <AppLayout>
            <Box
                bgGradient="linear(135deg, primary 0%, #f59e0b 100%)"
                rounded="2xl"
                p={{ base: 6, md: 8 }}
                boxShadow="xl"
            >
                <HStack justify="space-between" align="start" wrap="wrap" gap={4}>
                    <Box maxW="680px">
                        <Badge bg="rgba(255,255,255,0.2)" color="white" rounded="full" px={3} py={1}>
                            Sales dashboard
                        </Badge>
                        <Heading mt={3} size="lg" color="white">
                            Welcome back! Your business is growing steadily.
                        </Heading>
                        <Text mt={3} color="whiteAlpha.900" fontSize="md">
                            Manage products, customers, suppliers and reports in one elegant workspace.
                        </Text>
                    </Box>

                    <Stack direction={{ base: "column", sm: "row" }} spacing={3}>
                        <Button leftIcon={<LuPlus />} bg="white" color="primary" _hover={{ bg: "gray.100" }}>
                            New invoice
                        </Button>
                        <Button leftIcon={<LuBell />} variant="outline" borderColor="whiteAlpha.500" color="white" _hover={{ bg: "whiteAlpha.200" }}>
                            Alerts
                        </Button>
                    </Stack>
                </HStack>
            </Box>

            <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
                {stats.map((item) => (
                    <Box key={item.label} bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={5}>
                        <HStack justify="space-between">
                            <Box>
                                <Text color="muted" fontSize="sm">{item.label}</Text>
                                <Heading size="md" mt={1}>{item.value}</Heading>
                                <Text color="primary" fontSize="sm" mt={1}>{item.hint}</Text>
                            </Box>
                            <Box bg="card" p={3} rounded="xl">
                                <Icon as={item.icon} boxSize={5} color="primary" />
                            </Box>
                        </HStack>
                    </Box>
                ))}
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                <Box bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={6}>
                    <HStack justify="space-between" mb={4}>
                        <Heading size="md">Quick actions</Heading>
                        <Button size="sm" variant="ghost" color="primary" leftIcon={<LuSearch />}>
                            Explore
                        </Button>
                    </HStack>
                    <VStack align="stretch" spacing={3}>
                        {quickActions.map((action) => (
                            <Box key={action} bg="card" rounded="xl" p={3} border="1px solid" borderColor="border">
                                <Text fontWeight="600">{action}</Text>
                                <Text fontSize="sm" color="muted">Jump right into your daily workflow.</Text>
                            </Box>
                        ))}
                    </VStack>
                </Box>

                <Box bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={6}>
                    <Heading size="md" mb={4}>Today at a glance</Heading>
                    <VStack align="stretch" spacing={3}>
                        <HStack justify="space-between">
                            <Text color="muted">Pending invoices</Text>
                            <Text fontWeight="700">18</Text>
                        </HStack>
                        <HStack justify="space-between">
                            <Text color="muted">Low stock alerts</Text>
                            <Text fontWeight="700">6 items</Text>
                        </HStack>
                        <HStack justify="space-between">
                            <Text color="muted">Supplier follow-ups</Text>
                            <Text fontWeight="700">4</Text>
                        </HStack>
                    </VStack>
                </Box>
            </SimpleGrid>
        </AppLayout>
    );
}
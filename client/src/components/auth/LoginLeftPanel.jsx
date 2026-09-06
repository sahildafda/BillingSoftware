import {
    Badge,
    Box,
    VStack,
    Heading,
    Text,
    HStack,
    Icon,
    SimpleGrid,
} from "@chakra-ui/react";

import {
    LuPackage,
    LuReceipt,
    LuBarcode,
    LuShieldCheck,
} from "react-icons/lu";

const features = [
    {
        icon: LuReceipt,
        title: "Fast Billing",
        description: "Generate invoices in seconds",
    },
    {
        icon: LuPackage,
        title: "Inventory Management",
        description: "Track stock effortlessly",
    },
    {
        icon: LuBarcode,
        title: "Barcode Generator",
        description: "Create barcodes instantly",
    },
    {
        icon: LuShieldCheck,
        title: "GST Ready",
        description: "Stay compliant without the hassle",
    },
];

export default function LoginLeftPanel() {
    return (
        <Box
            h="100%"
            bg="background"
            color="text"
            px={{ base: 8, lg: 10 }}
            py={{ base: 10, lg: 16 }}
            display="flex"
            alignItems="center"
            position="relative"
            overflow="hidden"
        >
            <Box
                position="absolute"
                top="-90px"
                right="-90px"
                w="280px"
                h="280px"
                bg="primary"
                opacity={0.16}
                filter="blur(90px)"
                rounded="full"
            />

            <Box
                position="absolute"
                inset="0"
                bgImage="radial-gradient(circle at top left, rgba(217,119,87,0.2), transparent 36%), radial-gradient(circle at bottom right, rgba(255,255,255,0.08), transparent 28%)"
            />

            <VStack align="start" spacing={8} zIndex={1} maxW="480px">
                <Badge
                    colorScheme="orange"
                    bg="rgba(217, 119, 87, 0.16)"
                    color="primary"
                    px={3}
                    py={1}
                    rounded="full"
                >
                    Billing + Inventory
                </Badge>

                <Box>
                    <Heading size="2xl" fontWeight="700">
                        MotoDhandho
                    </Heading>
                    <Text color="muted" fontSize="lg" mt={2} lineHeight="tall">
                        Business made simple with a polished billing and stock experience.
                    </Text>
                </Box>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} w="100%">
                    {features.map((item) => (
                        <Box
                            key={item.title}
                            bg="surface"
                            border="1px solid"
                            borderColor="border"
                            rounded="xl"
                            p={4}
                        >
                            <HStack spacing={3} align="start">
                                <Icon as={item.icon} color="primary" boxSize={5} mt={1} />
                                <Box>
                                    <Text fontWeight="600">{item.title}</Text>
                                    <Text color="muted" fontSize="sm" mt={1}>
                                        {item.description}
                                    </Text>
                                </Box>
                            </HStack>
                        </Box>
                    ))}
                </SimpleGrid>

                <Text color="muted" fontSize="sm">
                    Version 1.0.0 • Secure and fast
                </Text>
            </VStack>
        </Box>
    );
}

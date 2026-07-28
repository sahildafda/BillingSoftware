import { HStack, Box, Text } from "@chakra-ui/react";
import { LuReceipt } from "react-icons/lu";

export default function Logo() {
    return (
        <HStack gap={3}>
            <Box
                bg="primary"
                w="48px"
                h="48px"
                rounded="xl"
                display="flex"
                alignItems="center"
                justifyContent="center"
                boxShadow="lg"
            >
                <LuReceipt size={24} color="white" />
            </Box>

            <Box>
                <Text
                    color="white"
                    fontWeight="700"
                    fontSize="lg"
                >
                    MotoDhandho
                </Text>
            </Box>
        </HStack>
    );
}
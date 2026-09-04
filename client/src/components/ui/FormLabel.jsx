import { Text } from "@chakra-ui/react";

export default function FormLabel({ children, required = false }) {
    return (
        <Text
            mb={2}
            color="text"
            fontSize="sm"
            fontWeight="500"
        >
            {children}
            {required && (
                <Text
                    as="span"
                    color="red.400"
                    ml={1}
                >
                    *
                </Text>
            )}
        </Text>
    );
}

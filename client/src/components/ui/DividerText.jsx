import {
  Flex,
  Divider,
  Text,
} from "@chakra-ui/react";

export default function DividerText({
  children = "OR",
}) {
  return (
    <Flex
      align="center"
      my={3}
    >
      <Divider />

      <Text
        mx={4}
        color="gray.500"
        fontSize="sm"
      >
        {children}
      </Text>

      <Divider />
    </Flex>
  );
}
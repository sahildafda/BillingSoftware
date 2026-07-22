import { Input } from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionInput = motion(Input);

export default function AppInput(props) {
    return (
        <MotionInput
            h="52px"
            bg="rgba(255,255,255,0.03)"
            border="1px solid"
            borderColor="border"
            color="white"
            rounded="xl"
            boxShadow="inset 0 1px 2px rgba(0,0,0,0.35)"
            _placeholder={{
                color: "gray.500",
            }}
            whileHover={{
                borderColor: "gray.500",
                bg: "rgba(255,255,255,0.05)",
            }}
            _focusVisible={{
                borderColor: "primary",
                boxShadow: "0 0 0 2px rgba(217,119,87,.22)",
            }}
            transition={{ duration: 0.2 }}
            {...props}
        />
    );
}
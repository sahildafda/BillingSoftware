import { Input } from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionInput = motion(Input);

export default function AppInput(props) {
    return (
        <MotionInput
            h="52px"
            bg="card"
            border="1px solid"
            borderColor="border"
            color="text"
            rounded="xl"
            boxShadow="inset 0 1px 2px rgba(0,0,0,0.08)"
            _placeholder={{
                color: "muted",
            }}
            whileHover={{
                borderColor: "gray.500",
                bg: "surface",
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

import { Button } from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionButton = motion(Button);

export default function AppButton(props) {
    return (
        <MotionButton
            bg="primary"
            color="white"
            h="45px"
            rounded="xl"
            fontWeight="600"
            border="1px solid transparent"
            boxShadow="0 10px 25px rgba(217, 119, 87, 0.2)"
            whileHover={{
                y: -2,
                boxShadow: "0 14px 30px rgba(217, 119, 87, 0.3)",
            }}
            whileTap={{
                y: 0,
                boxShadow: "0 8px 20px rgba(217, 119, 87, 0.2)",
            }}
            _hover={{
                bg: "primaryHover",
            }}
            {...props}
        />
    );
}
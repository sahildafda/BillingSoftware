import { useState } from "react";

import {
    InputGroup,
    InputRightElement,
    IconButton,
} from "@chakra-ui/react";

import { LuEye, LuEyeOff } from "react-icons/lu";

import AppInput from "./AppInput";

export default function PasswordInput(props) {
    const [show, setShow] = useState(false);

    return (
        <InputGroup>
            <AppInput
                type={show ? "text" : "password"}
                {...props}
            />

            <InputRightElement h="52px">
                <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShow(!show)}
                    icon={show ? <LuEyeOff /> : <LuEye />}
                />
            </InputRightElement>
        </InputGroup>
    );
}
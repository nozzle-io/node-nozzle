#include <node_api.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "nozzle/nozzle_c.h"

namespace {

struct receiver_handle {
    NozzleReceiver *receiver;
    bool closed;
};

struct sender_handle {
    NozzleSender *sender;
    bool closed;
};

const char *error_name(NozzleErrorCode code) {
    switch (code) {
        case NOZZLE_OK: return "NOZZLE_OK";
        case NOZZLE_ERROR_UNKNOWN: return "NOZZLE_ERROR_UNKNOWN";
        case NOZZLE_ERROR_INVALID_ARGUMENT: return "NOZZLE_ERROR_INVALID_ARGUMENT";
        case NOZZLE_ERROR_UNSUPPORTED_BACKEND: return "NOZZLE_ERROR_UNSUPPORTED_BACKEND";
        case NOZZLE_ERROR_UNSUPPORTED_FORMAT: return "NOZZLE_ERROR_UNSUPPORTED_FORMAT";
        case NOZZLE_ERROR_DEVICE_MISMATCH: return "NOZZLE_ERROR_DEVICE_MISMATCH";
        case NOZZLE_ERROR_RESOURCE_CREATION_FAILED: return "NOZZLE_ERROR_RESOURCE_CREATION_FAILED";
        case NOZZLE_ERROR_SHARED_HANDLE_FAILED: return "NOZZLE_ERROR_SHARED_HANDLE_FAILED";
        case NOZZLE_ERROR_SENDER_NOT_FOUND: return "NOZZLE_ERROR_SENDER_NOT_FOUND";
        case NOZZLE_ERROR_SENDER_CLOSED: return "NOZZLE_ERROR_SENDER_CLOSED";
        case NOZZLE_ERROR_TIMEOUT: return "NOZZLE_ERROR_TIMEOUT";
        case NOZZLE_ERROR_BACKEND_ERROR: return "NOZZLE_ERROR_BACKEND_ERROR";
        case NOZZLE_ERROR_COMMAND_FAILED: return "NOZZLE_ERROR_COMMAND_FAILED";
        default: return "NOZZLE_ERROR_UNRECOGNIZED";
    }
}

void throw_nozzle_error(napi_env env, NozzleErrorCode code, const char *operation) {
    char message[256];
    snprintf(message, sizeof(message), "%s failed: %s (%d)", operation, error_name(code), static_cast<int>(code));

    napi_value message_value;
    napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &message_value);

    napi_value error;
    napi_create_error(env, nullptr, message_value, &error);

    napi_value code_value;
    napi_create_string_utf8(env, error_name(code), NAPI_AUTO_LENGTH, &code_value);
    napi_set_named_property(env, error, "code", code_value);

    napi_value numeric_value;
    napi_create_int32(env, static_cast<int32_t>(code), &numeric_value);
    napi_set_named_property(env, error, "nativeCode", numeric_value);

    napi_throw(env, error);
}

bool get_string_arg(napi_env env, napi_value value, char *buffer, size_t buffer_size) {
    if (buffer_size == 0) {
        return false;
    }
    size_t copied = 0;
    napi_status status = napi_get_value_string_utf8(env, value, buffer, buffer_size, &copied);
    if (status != napi_ok) {
        return false;
    }
    buffer[buffer_size - 1] = '\0';
    return copied < buffer_size;
}

napi_value make_sender_info(napi_env env, const NozzleSenderInfo &info) {
    napi_value object;
    napi_create_object(env, &object);

    napi_value value;
    napi_create_string_utf8(env, info.name ? info.name : "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "name", value);

    napi_create_string_utf8(env, info.application_name ? info.application_name : "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "applicationName", value);

    napi_create_string_utf8(env, info.id ? info.id : "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "id", value);

    napi_create_int32(env, static_cast<int32_t>(info.backend), &value);
    napi_set_named_property(env, object, "backend", value);

    return object;
}

napi_value make_connected_info(napi_env env, const NozzleConnectedSenderInfo &info) {
    napi_value object;
    napi_create_object(env, &object);

    napi_value value;
    napi_create_string_utf8(env, info.name ? info.name : "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "name", value);

    napi_create_string_utf8(env, info.application_name ? info.application_name : "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "applicationName", value);

    napi_create_string_utf8(env, info.id ? info.id : "", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "id", value);

    napi_create_int32(env, static_cast<int32_t>(info.backend), &value);
    napi_set_named_property(env, object, "backend", value);

    napi_create_uint32(env, info.width, &value);
    napi_set_named_property(env, object, "width", value);

    napi_create_uint32(env, info.height, &value);
    napi_set_named_property(env, object, "height", value);

    napi_create_int32(env, static_cast<int32_t>(info.format), &value);
    napi_set_named_property(env, object, "format", value);

    napi_create_int32(env, static_cast<int32_t>(info.semantic_format), &value);
    napi_set_named_property(env, object, "semanticFormat", value);

    napi_create_double(env, info.estimated_fps, &value);
    napi_set_named_property(env, object, "estimatedFps", value);

    napi_create_bigint_uint64(env, info.frame_counter, &value);
    napi_set_named_property(env, object, "frameCounter", value);

    napi_create_bigint_uint64(env, info.last_update_time_ns, &value);
    napi_set_named_property(env, object, "lastUpdateTimeNs", value);

    napi_create_int32(env, static_cast<int32_t>(info.native_format_kind), &value);
    napi_set_named_property(env, object, "nativeFormatKind", value);

    napi_create_uint32(env, info.native_format_value, &value);
    napi_set_named_property(env, object, "nativeFormatValue", value);

    napi_create_bigint_uint64(env, info.native_format_modifier, &value);
    napi_set_named_property(env, object, "nativeFormatModifier", value);

    return object;
}

void finalize_receiver(napi_env env, void *data, void *hint) {
    (void)env;
    (void)hint;
    receiver_handle *handle = static_cast<receiver_handle *>(data);
    if (!handle) {
        return;
    }
    if (handle->receiver) {
        nozzle_receiver_destroy(handle->receiver);
        handle->receiver = nullptr;
    }
    handle->closed = true;
    free(handle);
}


void finalize_sender(napi_env env, void *data, void *hint) {
    (void)env;
    (void)hint;
    sender_handle *handle = static_cast<sender_handle *>(data);
    if (!handle) {
        return;
    }
    if (handle->sender) {
        nozzle_sender_destroy(handle->sender);
        handle->sender = nullptr;
    }
    handle->closed = true;
    free(handle);
}

sender_handle *get_sender_handle(napi_env env, napi_value value) {
    void *data = nullptr;
    napi_status status = napi_unwrap(env, value, &data);
    if (status != napi_ok || !data) {
        napi_throw_type_error(env, nullptr, "Expected a node-nozzle sender handle");
        return nullptr;
    }
    return static_cast<sender_handle *>(data);
}

receiver_handle *get_receiver_handle(napi_env env, napi_value value) {
    void *data = nullptr;
    napi_status status = napi_unwrap(env, value, &data);
    if (status != napi_ok || !data) {
        napi_throw_type_error(env, nullptr, "Expected a node-nozzle receiver handle");
        return nullptr;
    }
    return static_cast<receiver_handle *>(data);
}

napi_value list_sources(napi_env env, napi_callback_info info) {
    (void)info;
    NozzleSenderInfoArray array{};
    NozzleErrorCode code = nozzle_enumerate_senders(&array);
    if (code != NOZZLE_OK) {
        throw_nozzle_error(env, code, "nozzle_enumerate_senders");
        return nullptr;
    }

    napi_value result;
    napi_create_array_with_length(env, array.count, &result);
    for (uint32_t i = 0; i < array.count; ++i) {
        napi_value item = make_sender_info(env, array.items[i]);
        napi_set_element(env, result, i, item);
    }
    nozzle_free_sender_info_array(&array);
    return result;
}

napi_value create_receiver(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc < 1) {
        napi_throw_type_error(env, nullptr, "createReceiver requires a source name");
        return nullptr;
    }

    char name[512];
    if (!get_string_arg(env, args[0], name, sizeof(name)) || name[0] == '\0') {
        napi_throw_type_error(env, nullptr, "source name must be a non-empty string shorter than 512 bytes");
        return nullptr;
    }

    char application_name[256] = "node-nozzle";
    if (argc >= 2) {
        napi_valuetype type;
        napi_typeof(env, args[1], &type);
        if (type == napi_object) {
            napi_value app_value;
            bool has_app = false;
            napi_has_named_property(env, args[1], "applicationName", &has_app);
            if (has_app) {
                napi_get_named_property(env, args[1], "applicationName", &app_value);
                get_string_arg(env, app_value, application_name, sizeof(application_name));
            }
        }
    }

    NozzleReceiverDesc desc{};
    desc.name = name;
    desc.application_name = application_name;
    desc.receive_mode = NOZZLE_RECEIVE_LATEST_ONLY;

    NozzleReceiver *receiver = nullptr;
    NozzleErrorCode code = nozzle_receiver_create(&desc, &receiver);
    if (code != NOZZLE_OK) {
        throw_nozzle_error(env, code, "nozzle_receiver_create");
        return nullptr;
    }

    receiver_handle *handle = static_cast<receiver_handle *>(calloc(1, sizeof(receiver_handle)));
    if (!handle) {
        nozzle_receiver_destroy(receiver);
        napi_throw_error(env, "NOZZLE_NODE_ALLOCATION_FAILED", "failed to allocate receiver handle");
        return nullptr;
    }
    handle->receiver = receiver;
    handle->closed = false;

    napi_value object;
    napi_create_object(env, &object);
    napi_wrap(env, object, handle, finalize_receiver, nullptr, nullptr);
    return object;
}

napi_value destroy_receiver(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc < 1) {
        napi_throw_type_error(env, nullptr, "destroyReceiver requires a receiver handle");
        return nullptr;
    }

    receiver_handle *handle = get_receiver_handle(env, args[0]);
    if (!handle) {
        return nullptr;
    }
    if (handle->receiver) {
        nozzle_receiver_destroy(handle->receiver);
        handle->receiver = nullptr;
    }
    handle->closed = true;

    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

napi_value receiver_status(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc < 1) {
        napi_throw_type_error(env, nullptr, "receiverStatus requires a receiver handle");
        return nullptr;
    }

    receiver_handle *handle = get_receiver_handle(env, args[0]);
    if (!handle) {
        return nullptr;
    }

    napi_value status;
    napi_create_object(env, &status);

    napi_value closed;
    napi_get_boolean(env, handle->closed || handle->receiver == nullptr, &closed);
    napi_set_named_property(env, status, "closed", closed);

    if (handle->closed || !handle->receiver) {
        napi_value connected;
        napi_get_null(env, &connected);
        napi_set_named_property(env, status, "connected", connected);
        return status;
    }

    NozzleConnectedSenderInfo connected_info{};
    NozzleErrorCode code = nozzle_receiver_get_connected_info(handle->receiver, &connected_info);
    if (code == NOZZLE_OK) {
        napi_value connected = make_connected_info(env, connected_info);
        napi_set_named_property(env, status, "connected", connected);
    } else if (code == NOZZLE_ERROR_SENDER_NOT_FOUND || code == NOZZLE_ERROR_SENDER_CLOSED || code == NOZZLE_ERROR_TIMEOUT) {
        napi_value connected;
        napi_get_null(env, &connected);
        napi_set_named_property(env, status, "connected", connected);

        napi_value last_error;
        napi_create_string_utf8(env, error_name(code), NAPI_AUTO_LENGTH, &last_error);
        napi_set_named_property(env, status, "lastError", last_error);
    } else {
        throw_nozzle_error(env, code, "nozzle_receiver_get_connected_info");
        return nullptr;
    }

    return status;
}

napi_value diagnostics(napi_env env, napi_callback_info info) {
    (void)info;
    napi_value object;
    napi_create_object(env, &object);

    napi_value value;
    napi_create_string_utf8(env, "napi", NAPI_AUTO_LENGTH, &value);
    napi_set_named_property(env, object, "binding", value);

    napi_create_uint32(env, 8, &value);
    napi_set_named_property(env, object, "napiBaseline", value);

    napi_get_boolean(env, nozzle_backend_is_available(NOZZLE_BACKEND_METAL) != 0, &value);
    napi_set_named_property(env, object, "metalAvailable", value);

    napi_get_boolean(env, nozzle_backend_is_available(NOZZLE_BACKEND_D3D11) != 0, &value);
    napi_set_named_property(env, object, "d3d11Available", value);

    napi_get_boolean(env, nozzle_backend_is_available(NOZZLE_BACKEND_DMA_BUF) != 0, &value);
    napi_set_named_property(env, object, "dmaBufAvailable", value);

    napi_get_boolean(env, nozzle_backend_is_available(NOZZLE_BACKEND_OPENGL) != 0, &value);
    napi_set_named_property(env, object, "openglAvailable", value);

    return object;
}

napi_value create_test_sender(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc < 1) {
        napi_throw_type_error(env, nullptr, "createTestSender requires a sender name");
        return nullptr;
    }

    char name[512];
    if (!get_string_arg(env, args[0], name, sizeof(name)) || name[0] == '\0') {
        napi_throw_type_error(env, nullptr, "test sender name must be a non-empty string shorter than 512 bytes");
        return nullptr;
    }

    NozzleSenderDesc desc{};
    desc.name = name;
    desc.application_name = "node-nozzle-test";
    desc.ring_buffer_size = 3;
    desc.allow_format_fallback = 0;

    NozzleSender *sender = nullptr;
    NozzleErrorCode code = nozzle_sender_create(&desc, &sender);
    if (code != NOZZLE_OK) {
        throw_nozzle_error(env, code, "nozzle_sender_create");
        return nullptr;
    }

    sender_handle *handle = static_cast<sender_handle *>(calloc(1, sizeof(sender_handle)));
    if (!handle) {
        nozzle_sender_destroy(sender);
        napi_throw_error(env, "NOZZLE_NODE_ALLOCATION_FAILED", "failed to allocate sender handle");
        return nullptr;
    }
    handle->sender = sender;
    handle->closed = false;

    napi_value object;
    napi_create_object(env, &object);
    napi_wrap(env, object, handle, finalize_sender, nullptr, nullptr);
    return object;
}

napi_value destroy_test_sender(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc < 1) {
        napi_throw_type_error(env, nullptr, "destroyTestSender requires a sender handle");
        return nullptr;
    }
    sender_handle *handle = get_sender_handle(env, args[0]);
    if (!handle) {
        return nullptr;
    }
    if (handle->sender) {
        nozzle_sender_destroy(handle->sender);
        handle->sender = nullptr;
    }
    handle->closed = true;
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

napi_value init(napi_env env, napi_value exports) {
    napi_property_descriptor descriptors[] = {
        {"listSourcesNative", nullptr, list_sources, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"createReceiverNative", nullptr, create_receiver, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"destroyReceiverNative", nullptr, destroy_receiver, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"receiverStatusNative", nullptr, receiver_status, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"diagnosticsNative", nullptr, diagnostics, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"createTestSenderNative", nullptr, create_test_sender, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"destroyTestSenderNative", nullptr, destroy_test_sender, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
    return exports;
}

} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

        org $1800
command_auto
        jsr skip_spaces
        jsr parse_integer
        std auto_number_be
        ldd #10
        std auto_step_be
        jsr skip_spaces
        lda ,x
        cmpa #','
        bne auto_finish
        leax 1,x
        jsr skip_spaces
        jsr parse_integer
        std auto_step_be
auto_finish
        jsr finish_expression
        tsta
        lbne statement_return
        lda #1
        sta auto_active
        lbra statement_ok
auto_prompt
        ldy #buffer
        tst auto_active
        beq auto_prompt_done
        ldd auto_number_be
        std value_be
        clr negative
        jsr prdec
        lda #' '
        jsr cout
        lda #1
        sta sink_mode
        ldd #buffer
        std sink_cursor_be
        ldd auto_number_be
        std value_be
        jsr prdec
        lda #' '
        jsr cout
        clr sink_mode
        ldy sink_cursor_be
auto_prompt_done
        rts
auto_advance
        tst auto_active
        beq auto_prompt_done
        ldd auto_number_be
        addd auto_step_be
        std auto_number_be
        rts

; Original 17-round shift generator, including its all-zero seed correction.
; Return the old positive seed MOD the bound, then retain the new state.
rnd_function
        jsr skip_spaces
        lda ,x+
        cmpa #'('
        lbne expr_syntax
        jsr parse_or
        jsr numeric_type_check
        pshs d
        jsr skip_spaces
        lda ,x+
        cmpa #')'
        bne rnd_bad
        puls d
        std rnd_bound_be
        tst validation_mode
        bne rnd_dummy
        lda rnd_high
        bne rnd_seed_ready
        tst rnd_low
        bne rnd_seed_ready
        lda #1
rnd_seed_ready
        anda #$7f
        sta rnd_high
        ldb rnd_low
        std rnd_old_be
        ldb #17
rnd_round
        lda rnd_high
        lsla
        adda #$40
        lsla
        rol rnd_low
        rol rnd_high
        decb
        bne rnd_round
        ldd rnd_old_be
        std lhs_be
        ldd rnd_bound_be
        std rhs_be
        lda #'M'
        sta math_operator
        clr expr_is_string
        lbra signed_math
rnd_bad
        leas 2,s
        lbra expr_syntax
rnd_dummy
        ldd #0
        rts
peek_function
        jsr skip_spaces
        lda ,x+
        cmpa #'('
        lbne expr_syntax
        jsr parse_or
        jsr numeric_type_check
        pshs d
        jsr skip_spaces
        lda ,x+
        cmpa #')'
        bne rnd_bad
        puls u
        tst expr_is_string
        lbne expr_syntax
        tst validation_mode
        bne rnd_dummy
        clra
        ldb ,u
        rts
poke_statement
        jsr parse_or
        jsr numeric_type_check
        pshs d
        jsr skip_spaces
        lda ,x+
        cmpa #','
        bne poke_bad
        jsr parse_or
        std poke_value_be
        jsr numeric_type_check
        puls d
        std call_target_be
        jsr finish_expression
        tsta
        lbne statement_return
        tst validation_mode
        lbne statement_ok
        ldd poke_value_be
        tsta
        lbne byte_range_error
        ldu call_target_be
        stb ,u
        lbra statement_ok
poke_bad
        leas 2,s
        lbra syntax_error
call_statement
        jsr parse_or
        std call_target_be
        jsr numeric_type_check
        jsr finish_expression
        tsta
        lbne statement_return
        tst validation_mode
        lbne statement_ok
        pshs cc,dp,d,x,y,u
        jsr [call_target_be]
        puls cc,dp,d,x,y,u
        lbra statement_ok
byte_range_error
        ldx #byte_range_message
        lbra report_error

input_statement
        tst run_active
        bne input_allowed
        tst conditional_depth
        lbeq syntax_error
input_allowed
        clr input_had_prompt
        clr input_data_be
        clr input_data_be+1
        jsr skip_spaces
        lda ,x
        cmpa #'"'
        bne input_save_start
        jsr string_literal_expression
        ldd expr_string_be
        std input_prompt_be
        ldd expr_length_be
        std input_prompt_length_be
        jsr skip_spaces
        lda ,x+
        cmpa #','
        lbne syntax_error
        inc input_had_prompt
input_save_start
        stx input_variables_be
input_restart
        tst validation_mode
        bne input_item
        tst input_had_prompt
        beq input_item
        ldu input_prompt_be
        ldy input_prompt_length_be
        cmpy #0
        beq input_item
input_emit_prompt
        lda ,u+
        jsr cout
        leay -1,y
        bne input_emit_prompt
input_item
        jsr skip_spaces
        jsr variable_address
        lda ,x
        cmpa #'$'
        lbeq input_string
        jsr numeric_after_name
        stu input_numeric_target_be
        jsr check_expression_error
        tsta
        lbne statement_return
        stx input_source_cursor_be
        tst validation_mode
        lbne input_next_item
        ldx input_data_be
        bne input_parse_number
        jsr input_read_line
input_parse_number
        jsr skip_spaces
        clr input_negative
        lda ,x
        cmpa #'-'
        bne input_check_plus
        inc input_negative
        leax 1,x
        bra input_digits
input_check_plus
        cmpa #'+'
        bne input_digits
        leax 1,x
input_digits
        jsr parse_integer
        std input_value_be
        jsr skip_spaces
        lda ,x
        beq input_number_end
        cmpa #','
        bne input_invalid
        leax 1,x
        stx input_data_be
        bra input_store_number
input_number_end
        clr input_data_be
        clr input_data_be+1
input_store_number
        tst error_code
        bne input_invalid
        ldd input_value_be
        tst input_negative
        beq input_positive
        ldd #0
        subd input_value_be
input_positive
        ldu input_numeric_target_be
        stb ,u
        sta 1,u
        lbra input_next_item
input_invalid
        tst error_code
        bne input_keep_error
        lda #1
        sta error_code
input_keep_error
        jsr check_expression_error
        ldx #input_retype_message
        jsr emit_string
        clr error_code
        clr input_data_be
        clr input_data_be+1
        ldx input_variables_be
        lbra input_restart
input_string
        lda #1
        sta string_write_mode
        jsr string_reference
        clr string_write_mode
        jsr check_expression_error
        tsta
        lbne statement_return
        stx input_source_cursor_be
        tst validation_mode
        bne input_next_item
        ldd string_descriptor_be
        std input_string_descriptor_be
        ldd string_offset_be
        std input_string_offset_be
        ldd expr_string_be
        std input_string_target_be
        jsr input_read_line
        ldu input_string_descriptor_be
        ldd 3,u
        subd input_string_offset_be
        cmpd input_length_be
        bls input_string_count
        ldd input_length_be
input_string_count
        std input_copy_length_be
        addd input_string_offset_be
        std 5,u
        ldu input_string_target_be
        ldy input_copy_length_be
        cmpy #0
        beq input_string_done
input_copy_string
        lda ,x+
        sta ,u+
        leay -1,y
        bne input_copy_string
input_string_done
        clr input_data_be
        clr input_data_be+1
        ldd input_copy_length_be
        cmpd input_length_be
        lblt string_overflow_error
input_next_item
        ldx input_source_cursor_be
        jsr skip_spaces
        lda ,x
        beq input_done
        cmpa #','
        lbne syntax_error
        leax 1,x
        lbra input_item
input_done
        tst validation_mode
        lbne statement_ok
        tst input_had_prompt
        lbeq statement_ok
        jsr crout
        lbra statement_ok
input_read_line
        lda #'?'
        jsr cout
        ldy #input_buffer
input_read_key
        jsr rdkey
        cmpa #8
        bne input_echo_key
        lda #'_'
input_echo_key
        jsr cout
        cmpa #27
        bne input_not_cancelled
        lda #'\'
        jsr cout
        jsr crout
        ldy #input_buffer
        bra input_read_key
input_not_cancelled
        cmpa #13
        beq input_line_done
        cmpa #'_'
        beq input_delete
        sta ,y+
        cmpy #input_buffer+128
        blo input_read_key
        bra input_line_done
input_delete
        cmpy #input_buffer
        beq input_read_key
        leay -1,y
        bra input_read_key
input_line_done
        clr ,y
        tfr y,d
        subd #input_buffer
        std input_length_be
        ldx #input_buffer
        rts
input_retype_message fcc 'RETYPE LINE'
        fcb 13,0
byte_range_message fcc '*** >255 ERR'
        fcb 13,0
poke_value_be fdb 0
call_target_be fdb 0
auto_active fcb 0
auto_number_be fdb 0
auto_step_be fdb 0
rnd_low fcb 0
rnd_high fcb 0
rnd_old_be fdb 0
rnd_bound_be fdb 0
input_had_prompt fcb 0
input_prompt_be fdb 0
input_prompt_length_be fdb 0
input_variables_be fdb 0
input_source_cursor_be fdb 0
input_numeric_target_be fdb 0
input_data_be fdb 0
input_negative fcb 0
input_value_be fdb 0
input_string_descriptor_be fdb 0
input_string_offset_be fdb 0
input_string_target_be fdb 0
input_length_be fdb 0
input_copy_length_be fdb 0
input_buffer equ $4b00
io_module_end

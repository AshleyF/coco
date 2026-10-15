; Native numeric arrays/string records. Descriptors use private BE words;
; every numeric array element is explicitly LE. Storage grows down toward the
; program arena; CLR releases descriptors and storage without deleting lines.
        org $1000
storage_init
        ldd #descriptor_base
        std descriptor_end_be
        ldd memory_high_be
        std storage_bottom_be
        std storage_top_be
        clr expr_is_string
        rts
print_expression
        leau 1,x
print_check_dollar
        lda ,u
        cmpa #' '
        bne print_name_suffix
        leau 1,u
        bra print_check_dollar
print_name_suffix
        cmpa #'$'
        bne print_numeric_expression
        jsr variable_address
        lbra string_reference
print_numeric_expression
        lbra parse_or

; Search descriptors by variable identity and kind. U=result, or zero.
find_descriptor
        ldu #descriptor_base
descriptor_search
        cmpu descriptor_end_be
        beq descriptor_missing
        ldd ,u
        cmpd variable_key_be
        bne descriptor_next
        lda 2,u
        anda #1
        cmpa storage_kind
        beq descriptor_found
descriptor_next
        leau 11,u
        bra descriptor_search
descriptor_missing
        ldu #0
descriptor_found
        rts

; Allocate a descriptor, default capacity one. Numeric defaults alias the
; established scalar word; string defaults reserve one character of storage.
ensure_descriptor
        jsr find_descriptor
        cmpu #0
        bne descriptor_found
        tst validation_mode
        bne descriptor_dummy
        ldu descriptor_end_be
        leau 11,u
        cmpu #token_buffer
        lbhi storage_full
        leau -11,u
        ldd variable_key_be
        std ,u
        lda storage_kind
        sta 2,u
        ldd #1
        std 3,u
        std 9,u
        clr 5,u
        clr 6,u
        ldd variable_key_be
        tst storage_kind
        beq descriptor_default_data
        ldd storage_bottom_be
        subd #1
        cmpd program_end_be
        lbls storage_full
        cmpd memory_low_be
        lbls storage_full
        std storage_bottom_be
descriptor_default_data
        std 7,u
        leau 11,u
        stu descriptor_end_be
        leau -11,u
        rts
descriptor_dummy
        ldu #dummy_descriptor
        rts

numeric_reference
        jsr variable_address
numeric_after_name
        clr storage_kind
        jsr ensure_descriptor
        stx reference_cursor_be
        pshs u
        jsr skip_spaces
        lda ,x
        cmpa #'('
        bne numeric_first
        leax 1,x
        jsr parse_or
        std reference_index_be
        jsr numeric_type_check
        jsr skip_spaces
        lda ,x+
        cmpa #')'
        bne numeric_bad_syntax
        tst error_code
        bne numeric_failed
        tst validation_mode
        bne numeric_first
        ldu ,s
        ldd reference_index_be
        cmpd #1
        blt numeric_bad_range
        cmpd 3,u
        bhi numeric_bad_range
        subd #1
        lslb
        rola
        addd 7,u
        tfr d,u
        leas 2,s
        rts
numeric_first
        puls u
        ldu 7,u
        rts
numeric_bad_syntax
        jsr expr_syntax
        bra numeric_failed
numeric_bad_range
        lda #3
        sta error_code
numeric_failed
        puls u
        ldu 7,u
        rts

dim_statement
        jsr skip_spaces
        jsr variable_address
        clr storage_kind
        lda ,x
        cmpa #'$'
        bne dim_open
        leax 1,x
        inc storage_kind
dim_open
        lda storage_kind
        ldd variable_key_be
        pshs d
        lda storage_kind
        pshs a
        jsr skip_spaces
        lda ,x+
        cmpa #'('
        lbne dim_parse_error
        jsr parse_or
        std dimension_size_be
        jsr numeric_type_check
        jsr skip_spaces
        lda ,x+
        cmpa #')'
        lbne dim_parse_error
        puls a
        sta storage_kind
        puls d
        std variable_key_be
        jsr check_expression_error
        tsta
        lbne statement_return
        tst validation_mode
        lbne dim_continue
        ldd dimension_size_be
        tst storage_kind
        beq dim_numeric_size
        tsta
        lbne byte_range_error
        tstb
        lbeq string_range_error
dim_numeric_size
        cmpd #1
        lblt array_range_error
        cmpd #16384
        lbhs array_range_error
        jsr find_descriptor
        cmpu #0
        beq dim_new
        leau 11,u
        cmpu descriptor_end_be
        lbne dimension_error
        leau -11,u
        ldd dimension_size_be
        cmpd 9,u
        bhi dim_existing_grow
        std 3,u
        lbra dim_continue
dim_existing_grow
        clr dimension_new_flag
        stu dimension_descriptor_be
        bra dim_allocate
dim_new
        ldu descriptor_end_be
        leau 11,u
        cmpu #token_buffer
        lbhi storage_full_error
        leau -11,u
        lda #1
        sta dimension_new_flag
        stu dimension_descriptor_be
        ldd variable_key_be
        std ,u
        lda storage_kind
        ora #$80
        sta 2,u
        clr 3,u
        clr 4,u
        clr 5,u
        clr 6,u
        clr 7,u
        clr 8,u
        clr 9,u
        clr 10,u
dim_allocate
        ldd dimension_size_be
        tst storage_kind
        bne dim_byte_size
        lslb
        rola
dim_byte_size
        std dimension_bytes_be
        cmpd storage_bottom_be
        lbhs storage_full_error
        ldu dimension_descriptor_be
        ldd 9,u
        tst storage_kind
        bne dim_old_bytes
        lslb
        rola
dim_old_bytes
        std dimension_old_bytes_be
        ldd dimension_bytes_be
        ldy 7,u
        cmpy storage_bottom_be
        bne dim_fresh_block
        ; The last data block can grow downwards in place. Reuse its old bytes
        ; rather than leaking a full block on every successful DIM enlargement.
        subd dimension_old_bytes_be
dim_fresh_block
        std dimension_extra_be
        ldd storage_bottom_be
        subd dimension_extra_be
        cmpd program_end_be
        lbls storage_full_error
        cmpd memory_low_be
        lbls storage_full_error
        std dimension_data_be
        pshs x
        ldu dimension_descriptor_be
        ldd 7,u
        std dimension_old_data_be
        ldy dimension_old_bytes_be
        ldx 7,u
        ldu dimension_data_be
        cmpy #0
        beq dim_zero_tail
dim_copy
        lda ,x+
        sta ,u+
        leay -1,y
        bne dim_copy
dim_zero_tail
        ldd dimension_bytes_be
        subd dimension_old_bytes_be
        tfr d,y
dim_zero
        cmpy #0
        beq dim_install
        clr ,u+
        leay -1,y
        bra dim_zero
dim_install
        puls x
        ldu dimension_descriptor_be
        ldd dimension_data_be
        std storage_bottom_be
        std 7,u
        ldd dimension_size_be
        std 3,u
        std 9,u
        jsr repair_dimension_loops
        tst dimension_new_flag
        beq dim_continue
        leau 11,u
        stu descriptor_end_be
dim_continue
        jsr skip_spaces
        lda ,x
        lbeq statement_ok
        cmpa #','
        lbne syntax_error
        leax 1,x
        lbra dim_statement
repair_dimension_loops
        pshs x,u
        ldx #for_frames
        lda for_nest_count
        sta dimension_loop_count
dimension_loop_repair
        tst dimension_loop_count
        beq dimension_loop_repaired
        ldd ,x
        cmpd dimension_old_data_be
        bne dimension_loop_next
        ldd dimension_data_be
        std ,x
dimension_loop_next
        leax 10,x
        dec dimension_loop_count
        bra dimension_loop_repair
dimension_loop_repaired
        puls x,u,pc
dim_parse_error
        leas 3,s
        lbra syntax_error

; X points to '$' after variable_address. Result: start/length and descriptor.
; Read subscripts use current length; write subscripts use capacity.
string_reference
        leax 1,x
        lda #1
        sta storage_kind
        jsr ensure_descriptor
        stu string_descriptor_be
        ldd 7,u
        std expr_string_be
        ldd 5,u
        std expr_length_be
        clr string_offset_be
        clr string_offset_be+1
        jsr skip_spaces
        lda ,x
        cmpa #'('
        lbne string_ref_done
        leax 1,x
        pshs u
        jsr parse_or
        std string_first_be
        jsr skip_spaces
        lda ,x
        cmpa #','
        bne string_one_index
        tst string_write_mode
        lbne string_ref_syntax
        leax 1,x
        ldd string_first_be
        pshs d
        jsr parse_or
        std string_last_be
        puls d
        std string_first_be
        bra string_close
string_one_index
        ldu ,s
        ldd 5,u
        tst string_write_mode
        beq string_one_read
        ldd 3,u
string_one_read
        std string_last_be
string_close
        jsr skip_spaces
        lda ,x+
        cmpa #')'
        bne string_ref_syntax
        puls u
        stu string_descriptor_be
        tst error_code
        lbne string_ref_done
        tst validation_mode
        lbne string_ref_dummy
        lda string_first_be
        ora string_last_be
        bne string_ref_byte_range
        tst string_write_mode
        beq string_check_first
        ldd 5,u
        addd #1
        cmpd string_first_be
        lblo string_ref_range
string_check_first
        ldd string_first_be
        cmpd #1
        lblt string_ref_range
        subd #1
        std string_offset_be
        addd 7,u
        std expr_string_be
        ldd 5,u
        tst string_write_mode
        beq string_ref_bound
        ldd 3,u
string_ref_bound
        cmpd string_last_be
        lblo string_ref_range
        ldd string_last_be
        subd string_offset_be
        cmpd #1
        lblt string_ref_range
        std expr_length_be
        bra string_ref_done
string_ref_syntax
        leas 2,s
        lbra expr_syntax
string_ref_range
        lda #4
        sta error_code
        bra string_ref_done
string_ref_byte_range
        lda #8
        sta error_code
        bra string_ref_done
string_ref_dummy
        clr expr_length_be
        clr expr_length_be+1
string_ref_done
        lda #1
        sta expr_is_string
        ldd #0
        rts

string_assignment
        lda #1
        sta string_write_mode
        jsr string_reference
        clr string_write_mode
        ldd expr_string_be
        std string_target_be
        ldd string_descriptor_be
        pshs d
        ldd string_offset_be
        pshs d
        jsr skip_spaces
        lda ,x+
        cmpa #'='
        lbne string_assign_syntax
        jsr parse_or
        jsr finish_expression
        tsta
        lbne string_assign_failed
        tst expr_is_string
        beq string_assign_syntax
        puls d
        std string_offset_be
        puls u
        tst validation_mode
        lbne statement_ok
        ldd 3,u
        subd string_offset_be
        cmpd expr_length_be
        bls string_copy_count
        ldd expr_length_be
string_copy_count
        std string_copy_length_be
        addd string_offset_be
        pshs d
        ldd string_copy_length_be
        cmpd expr_length_be
        bge string_set_length
        ldd ,s
        cmpd 5,u
        bge string_set_length
        ldd 5,u
        std ,s
string_set_length
        puls d
        std 5,u
        pshs x
        ldx expr_string_be
        ldu string_target_be
        ldy string_copy_length_be
        cmpy #0
        beq string_copy_done
        ; The original streams forwards even for overlapping self-assignment.
        ; A$(2)=A$ can therefore repeat its first character; do not use memmove.
string_copy_forward
        lda ,x+
        sta ,u+
        leay -1,y
        bne string_copy_forward
string_copy_done
        puls x
        ldd string_copy_length_be
        cmpd expr_length_be
        lblt string_overflow_error
        lbra statement_ok
string_assign_syntax
        leas 4,s
        lbra syntax_error
string_assign_failed
        leas 4,s
        rts

string_literal_expression
        leax 1,x
        stx expr_string_be
        ldd #0
string_literal_scan
        lda ,x+
        lbeq expr_syntax
        cmpa #'"'
        beq string_literal_done
        bra string_literal_scan
string_literal_done
        tfr x,d
        subd expr_string_be
        subd #1
        std expr_length_be
        lda #1
        sta expr_is_string
        ldd #0
        rts
len_function
        jsr skip_spaces
        lda ,x+
        cmpa #'('
        lbne expr_syntax
        jsr parse_or
        tst expr_is_string
        lbeq expr_syntax
        ldd expr_length_be
        pshs d
        jsr skip_spaces
        lda ,x+
        cmpa #')'
        bne len_error
        clr expr_is_string
        puls d,pc
len_error
        leas 2,s
        lbra expr_syntax

; Preserve the left string span while recursive RHS parsing replaces the
; expression scratch. Compare contents and length, never relocated pointers.
string_compare_expression
        jsr skip_spaces
        lda ,x
        cmpa #'='
        beq string_compare_operator
        cmpa #'#'
        beq string_compare_operator
        ldd #0
        rts
string_compare_operator
        sta comparison
        leax 1,x
        cmpa #'<'
        bne string_check_ge
        lda ,x
        cmpa #'>'
        bne string_check_le
        leax 1,x
        lda #'#'
        sta comparison
        bra string_save_left
string_check_le
        cmpa #'='
        bne string_save_left
        leax 1,x
        lda #'L'
        sta comparison
        bra string_save_left
string_check_ge
        lda comparison
        cmpa #'>'
        bne string_save_left
        lda ,x
        cmpa #'='
        bne string_save_left
        leax 1,x
        lda #'G'
        sta comparison
string_save_left
        ldd expr_length_be
        pshs d
        ldd expr_string_be
        pshs d
        lda comparison
        pshs a
        jsr parse_sum
        tst error_code
        bne string_comparison_error
        tst expr_is_string
        beq string_comparison_syntax
        puls a
        sta comparison
        puls u
        puls y
        pshs x
        ldx expr_string_be
        ldd expr_length_be
        std string_right_length_be
string_compare_loop
        cmpy #0
        beq string_left_end
        ldd string_right_length_be
        beq string_left_greater
        lda ,u+
        cmpa ,x+
        blo string_left_less
        bhi string_left_greater
        leay -1,y
        ldd string_right_length_be
        subd #1
        std string_right_length_be
        bra string_compare_loop
string_left_end
        ldd string_right_length_be
        beq string_equal
string_left_less
        ldd #-1
        bra string_classify
string_left_greater
        ldd #1
        bra string_classify
string_equal
        ldd #0
string_classify
        std lhs_be
        clr expr_is_string
        puls x
        lbra compare_classify
string_comparison_syntax
        jsr expr_syntax
string_comparison_error
        leas 5,s
        ldd #0
        rts
storage_full
        lda #6
        sta error_code
        ldu #dummy_descriptor
        rts
array_range_error
        ldx #array_range_message
        lbra report_error
string_range_error
        ldx #string_range_message
        lbra report_error
dimension_error
        ldx #dimension_message
        lbra report_error
storage_full_error
        ldx #memory_message
        lbra report_error
string_overflow_error
        ldx #string_overflow_message
        lbra report_error
array_range_message fcc '*** RANGE ERR'
        fcb 13,0
string_range_message fcc '*** STRING ERR'
        fcb 13,0
dimension_message fcc '*** DIM ERR'
        fcb 13,0
string_overflow_message fcc '*** STR OVFL ERR'
        fcb 13,0
descriptor_base equ $4240
memory_low_be fdb $5000
memory_high_be fdb $7000
storage_top_be fdb $7000
descriptor_end_be fdb 0
storage_bottom_be fdb $7000
variable_key_be fdb 0
storage_kind fcb 0
dummy_descriptor fdb 0
        fcb 0
        fdb 32767,0,variables,32767
reference_cursor_be fdb 0
reference_index_be fdb 0
dimension_size_be fdb 0
dimension_descriptor_be fdb 0
dimension_bytes_be fdb 0
dimension_data_be fdb 0
dimension_old_bytes_be fdb 0
dimension_extra_be fdb 0
dimension_new_flag fcb 0
dimension_old_data_be fdb 0
dimension_loop_count fcb 0
expr_is_string fcb 0
expr_string_be fdb 0
expr_length_be fdb 0
string_descriptor_be fdb 0
string_first_be fdb 0
string_last_be fdb 0
string_offset_be fdb 0
string_write_mode fcb 0
string_target_be fdb 0
string_copy_length_be fdb 0
string_right_length_be fdb 0
storage_module_end

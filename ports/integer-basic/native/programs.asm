; Native compact program records: [length][line number LE][tokens...][0].
; Records are sorted ascending in the native $5000-$6FFF arena. Numeric token
; operands are LE. Native record/cursor scratch pointers explicitly use BE.
        org     $2000
program_init
        ldd     #program_base
        std     program_end_be
        clr     program_base
        clr     run_active
        clr     validation_mode
        clr     sink_mode
        clr     auto_active
        clr     conditional_depth
        clr     branch_taken
        clr     resume_offset_be
        clr     resume_offset_be+1
        clr     listing_mode
        rts
command_line
        ldx     #buffer
        jsr     validate_original_source
        tsta
        beq     command_line_valid
        sta     error_code
        lbra    check_expression_error
command_line_valid
        jsr     skip_spaces
        lda     ,x
        cmpa    #'0'
        blo     command_words
        cmpa    #'9'
        lbls    edit_line
command_words
        ldu     #kw_auto
        jsr     keyword
        lbcs    command_auto
        ldu     #kw_list
        jsr     keyword
        lbcs    command_list
        ldu     #kw_del
        jsr     keyword
        lbcs    command_delete
        ldu     #kw_scr
        jsr     keyword
        bcs     command_scr
        ldu     #kw_run
        jsr     keyword
        lbcs    command_run
        ; Original source is syntax-checked before execution. A malformed
        ; immediate statement must not allocate variables or emit partial PRINT.
        pshs    x
        lda     #1
        sta     validation_mode
        jsr     statement_at
        pshs    a
        clr     validation_mode
        puls    a
        puls    x
        tsta
        lbeq    statement_at
        tst     error_code
        bne     immediate_validation_error
        lda     #1
        sta     error_code
immediate_validation_error
        lbra    check_expression_error
command_scr
        jsr     skip_spaces
        lda     ,x
        lbne    syntax_error
        jsr     program_init
        jsr     clr_cmd
        clra
        rts
edit_line
        clr     error_code
        jsr     parse_integer
        std     edit_number_be
        tst     error_code
        lbne    edit_error
        jsr     skip_spaces
        lda     ,x
        lbeq    edit_delete
        jsr     tokenize
        tst     error_code
        lbne    edit_error
        ldx     #token_buffer
        jsr     render_source
        lda     #1
        sta     validation_mode
        sta     run_active
        jsr     execute_source
        sta     validation_result
        clr     validation_mode
        clr     run_active
        tst     validation_result
        lbne    edit_error
        ; Validate the whole prospective record before modifying existing data.
        jsr     find_edit_position
        ldd     new_length_be
        subd    old_length_be
        addd    program_end_be
        cmpd    storage_bottom_be
        lbhs    program_full
        jsr     remove_record
        ldd     new_length_be
        ldu     program_end_be
        leau    d,u
        stu     new_end_be
        ldx     program_end_be
        ldy     new_end_be
shift_up
        cmpx    record_be
        beq     insert_record
        lda     ,-x
        sta     ,-y
        bra     shift_up
insert_record
        ldu     record_be
        ldd     new_length_be
        stb     ,u+
        ldd     edit_number_be
        stb     ,u+
        sta     ,u+
        ldx     #token_buffer
        ldd     new_length_be
        subd    #3
        tfr     d,y
copy_tokens
        lda     ,x+
        sta     ,u+
        leay    -1,y
        bne     copy_tokens
        ldd     new_end_be
        std     program_end_be
        ldu     program_end_be
        clr     ,u
        jsr     auto_advance
        lda     #2             ; numbered input returns directly to prompt
        rts
edit_delete
        jsr     find_edit_position
        ldu     record_be
        cmpu    program_end_be
        beq     edit_done
        ldb     1,u
        lda     2,u
        cmpd    edit_number_be
        bne     edit_done
        jsr     remove_record
edit_done
        jsr     auto_advance
        lda     #2
        rts
edit_error
        lda     error_code
        cmpa    #2
        lbeq    range_error
        lbra    syntax_error
program_full
        ldx     #memory_message
        lbra    report_error
find_edit_position
        ldu     #program_base
find_edit_loop
        cmpu    program_end_be
        beq     find_edit_done
        ldb     1,u
        lda     2,u
        cmpd    edit_number_be
        bhs     find_edit_done
        clra
        ldb     ,u
        leau    d,u
        bra     find_edit_loop
find_edit_done
        stu     record_be
        cmpu    program_end_be
        beq     no_old_record
        ldb     1,u
        lda     2,u
        cmpd    edit_number_be
        beq     old_record_found
no_old_record
        clr     old_length_be
        clr     old_length_be+1
        rts
old_record_found
        clra
        ldb     ,u
        std     old_length_be
        rts
remove_record
        ldd     old_length_be
        beq     remove_done
        ldx     record_be
        leay    d,x
compact_down
        cmpy    program_end_be
        beq     compact_done
        lda     ,y+
        sta     ,x+
        bra     compact_down
compact_done
        stx     program_end_be
        clr     ,x
remove_done
        rts

; Lexer for the supported source grammar. Keyword IDs are native, not Apple
; dispatch addresses. Strings and REM keep ASCII contents; numbers use LE words.
tokenize
        ldy     #token_buffer
        clr     identifier_mode
lex_next
        lda     ,x
        lbeq    lex_done
        cmpa    #' '
        beq     lex_space
        cmpa    #'"'
        beq     lex_string
        cmpa    #'0'
        blo     lex_word
        cmpa    #'9'
        bhi     lex_word
        tst     identifier_mode
        bne     lex_raw
        jsr     parse_integer
        tst     error_code
        lbne    lex_return
        pshs    d
        lda     #$f0
        sta     ,y+
        puls    d
        stb     ,y+
        sta     ,y+
        lbra    lex_next
lex_space
        leax    1,x
        bra     lex_next
lex_string
        lda     ,x+
        sta     ,y+
lex_string_loop
        lda     ,x+
        lbeq    expr_syntax
        sta     ,y+
        cmpa    #'"'
        bne     lex_string_loop
        clr     identifier_mode
        bra     lex_next
lex_word
        cmpa    #'A'
        blo     lex_punctuation
        cmpa    #'Z'
        bhi     lex_punctuation
        ldu     #token_words
        stu     keyword_scan_be
lex_try_word
        ldu     keyword_scan_be
        lda     ,u
        beq     lex_identifier
        ldu     4,u
        jsr     keyword
        bcs     lex_keyword
        ldu     keyword_scan_be
        leau    6,u
        stu     keyword_scan_be
        bra     lex_try_word
lex_keyword
        clr     identifier_mode
        ldu     keyword_scan_be
        lda     ,u
        sta     ,y+
        cmpa    #$82            ; REM consumes the original remaining text
        lbne    lex_next
lex_rem
        lda     ,x+
        sta     ,y+
        bne     lex_rem
        bra     lex_size
lex_identifier
        inc     identifier_mode
        bra     lex_raw
lex_punctuation
        cmpa    #'$'
        beq     lex_raw
        clr     identifier_mode
lex_raw
        lda     ,x+
        sta     ,y+
        lbra    lex_next
lex_done
        clr     ,y+
lex_size
        tfr     y,d
        subd    #token_buffer
        addd    #3
        cmpd    #255
        lbhi    expr_range
        std     new_length_be
lex_return
        rts

; Render token stream into source RAM, or into the LIST console. Number output
; reuses prdec; cout's memory sink prevents host output during source rendering.
render_source
        lda     #1
        sta     sink_mode
        clr     listing_mode
        ldd     #source_buffer
        std     sink_cursor_be
        jsr     render_tokens
        ldu     sink_cursor_be
        clr     ,u
        clr     sink_mode
        rts
render_tokens
        clr     render_string
        clr     render_rem
        clr     render_last
render_loop
        lda     ,x+
        lbeq    render_done
        tst     render_rem
        bne     render_character
        tst     render_string
        bne     render_quote_character
        cmpa    #'"'
        beq     render_open_quote
        cmpa    #$f0
        beq     render_number
        cmpa    #$80
        lbhs    render_keyword
        cmpa    #'('
        bne     render_raw_boundary
        ; Original variable-array names and LEN( are single listing tokens.
        ; Keep the attached parenthesis on the same line as the name.
        ldb     render_last
        cmpb    #'$'
        beq     render_character
        cmpb    #'0'
        blo     render_check_len
        cmpb    #'9'
        bls     render_character
        cmpb    #'A'
        blo     render_raw_boundary
        cmpb    #'Z'
        bls     render_character
render_check_len
        tstb
        bne     render_raw_boundary
        ldb     render_token
        cmpb    #$97
        beq     render_character
render_raw_boundary
        pshs    a
        ldb     #32
        jsr     list_wrap
        puls    a
        bra     render_character
render_open_quote
        inc     render_string
        bra     render_character
render_quote_character
        cmpa    #'"'
        bne     render_character
        clr     render_string
render_character
        pshs    a
        ldb     #37
        jsr     list_wrap
        puls    a
        sta     render_last
        jsr     cout
        lbra    render_loop
render_number
        ldb     ,x+
        lda     ,x+
        std     value_be
        clr     negative
        pshs    x
        ldb     #32
        jsr     list_wrap
        jsr     prdec
        puls    x
        lda     #'0'
        sta     render_last
        lbra    render_loop
render_keyword
        sta     render_token
        ldu     #token_words
render_find_word
        cmpa    ,u
        beq     render_word_found
        leau    6,u
        bra     render_find_word
render_word_found
        stu     render_entry_be
        pshs    x
        ldb     #32
        tst     listing_mode
        beq     render_leading
        subb    2,u             ; reserve keyword width at token boundaries
        jsr     list_wrap
render_leading
        lda     1,u
        bita    #16
        beq     render_regular_leading
        lda     render_last
        beq     render_word
        cmpa    #' '
        beq     render_word
        bra     render_pre_space
render_regular_leading
        lda     1,u
        bita    #2
        bne     render_pre_space
        lda     render_last
        cmpa    #':'
        bne     render_word
        lda     1,u
        bita    #8
        beq     render_word
render_pre_space
        lda     #' '
        jsr     cout
render_word
        ldx     4,u
        jsr     emit_string
        ldu     render_entry_be
        lda     1,u
        bita    #1
        beq     render_after_word
        lda     #' '
        jsr     cout
render_after_word
        lda     render_token
        cmpa    #$82
        bne     render_not_rem
        inc     render_rem
render_not_rem
        clr     render_last
        puls    x
        lbra    render_loop
render_done
        ; The original REM listing loop checks wrapping before its terminator,
        ; so a comment ending on column 37 emits an empty continuation line.
        tst     render_rem
        beq     render_return
        ldb     #37
        jsr     list_wrap
render_return
        rts
list_wrap
        tst     listing_mode
        beq     wrap_done
        cmpb    column
        bhs     wrap_done
        jsr     crout
        pshs    b
        ldb     #6
wrap_indent
        lda     #' '
        jsr     cout
        decb
        bne     wrap_indent
        puls    b
wrap_done
        rts

; LIST/DEL selectors are inclusive. A single argument selects that exact line.
parse_line_range
        clr     error_code
        clr     range_first_be
        clr     range_first_be+1
        ldd     #32767
        std     range_last_be
        jsr     skip_spaces
        lda     ,x
        beq     range_args_done
        jsr     parse_or
        std     range_first_be
        std     range_last_be
        jsr     numeric_type_check
        tst     error_code
        bne     range_args_error
        jsr     skip_spaces
        lda     ,x
        cmpa    #','
        bne     range_args_finish
        leax    1,x
        jsr     parse_or
        std     range_last_be
        jsr     numeric_type_check
        tst     error_code
        bne     range_args_error
        cmpd    range_first_be
        bhs     range_args_finish
        ldd     range_first_be
        std     range_last_be
range_args_finish
        jsr     finish_expression
        rts
range_args_error
        jsr     finish_expression
        rts
range_args_done
        clra
        rts
command_list
        jsr     parse_line_range
        tsta
        lbne    statement_return
        ldu     #program_base
list_records
        cmpu    program_end_be
        lbeq    statement_ok
        stu     record_be
        ldb     1,u
        lda     2,u
        cmpd    range_first_be
        blo     list_next
        cmpd    range_last_be
        bhi     list_next
        std     value_be
        clr     negative
        ; Five-character line-number field, followed by one space.
        lda     #4
        sta     list_padding
        ldd     value_be
        cmpd    #10
        blo     list_pad
        dec     list_padding
        cmpd    #100
        blo     list_pad
        dec     list_padding
        cmpd    #1000
        blo     list_pad
        dec     list_padding
        cmpd    #10000
        blo     list_pad
        dec     list_padding
list_pad
        ldb     list_padding
        tstb
        beq     list_number
        lda     #' '
        jsr     cout
        dec     list_padding
        bra     list_pad
list_number
        jsr     prdec
        lda     #' '
        jsr     cout
        ldx     record_be
        leax    3,x
        lda     #1
        sta     listing_mode
        jsr     render_tokens
        clr     listing_mode
        jsr     crout
list_next
        ldu     record_be
        clra
        ldb     ,u
        leau    d,u
        lbra    list_records
command_delete
        jsr     parse_line_range
        tsta
        lbne    statement_return
        ldu     #program_base
delete_records
        cmpu    program_end_be
        lbeq    statement_ok
        stu     record_be
        ldb     1,u
        lda     2,u
        cmpd    range_first_be
        blo     delete_next
        cmpd    range_last_be
        bhi     delete_next
        clra
        ldb     ,u
        std     old_length_be
        jsr     remove_record
        ldu     record_be
        bra     delete_records
delete_next
        clra
        ldb     ,u
        leau    d,u
        bra     delete_records

command_run
        clr     error_code
        jsr     skip_spaces
        lda     ,x
        beq     run_all
        jsr     parse_or
        std     edit_number_be
        jsr     numeric_type_check
        jsr     finish_expression
        tsta
        lbne    statement_return
        jsr     find_edit_position
        ldu     record_be
        cmpu    program_end_be
        lbeq    bad_branch
        ldb     1,u
        lda     2,u
        cmpd    edit_number_be
        lbne    bad_branch
        bra     run_start
run_all
        ldu     #program_base
run_start
        stu     run_record_be
        jsr     clr_cmd
run_preserve_variables
        clr     resume_offset_be
        clr     resume_offset_be+1
        lda     #1
        sta     run_active
run_records
        ldu     run_record_be
        cmpu    program_end_be
        lbeq    run_no_end
        ldb     1,u
        lda     2,u
        std     run_number_be
        ; NEXT and RETURN resume a statement cursor directly in the original;
        ; its keyboard check applies to new record entries, not those resumes.
        ldd     resume_offset_be
        bne     run_after_key_poll
        jsr     poll_keyboard
        lbne    run_statement_error
run_after_key_poll
        clra
        ldb     ,u
        leau    d,u
        stu     run_next_be
        ldx     run_record_be
        leax    3,x
        jsr     render_source
        jsr     execute_resumed_source
        tsta
        lbne    run_statement_error
        tst     run_active
        lbeq    statement_ok
        ldd     run_next_be
        std     run_record_be
        lbra    run_records
run_no_end
        clr     run_active
        ldx     #end_message
        lbra    report_error
run_statement_error
        clr     run_active
        ldx     #stopped_message
        jsr     emit_string
        ldd     run_number_be
        std     value_be
        clr     negative
        jsr     prdec
        jsr     crout
        lda     #1
        rts
bad_branch
        ldx     #branch_message
        lbra    report_error

; Execute/validate colon-separated statements from rendered source. Quoted
; colons stay inside literals; REM consumes the rest of the physical line.
execute_source
        clr     resume_offset_be
        clr     resume_offset_be+1
execute_resumed_source
        clr     branch_taken
        ldd     #source_buffer
        addd    resume_offset_be
        clr     resume_offset_be
        clr     resume_offset_be+1
        std     statement_cursor_be
source_statement
        ldx     statement_cursor_be
        jsr     skip_spaces
        ldu     #kw_rem
        jsr     keyword
        lbcs    statement_ok
        ldx     statement_cursor_be
        clr     source_quote
find_statement_end
        lda     ,x
        beq     source_last
        cmpa    #'"'
        bne     source_not_quote
        com     source_quote
source_not_quote
        tst     source_quote
        bne     source_advance
        cmpa    #':'
        beq     source_split
source_advance
        leax    1,x
        bra     find_statement_end
source_split
        stx     statement_delimiter_be
        clr     ,x
        leax    1,x
        stx     next_statement_be
        bra     source_execute
source_last
        clr     next_statement_be
        clr     next_statement_be+1
source_execute
        ldx     statement_cursor_be
        jsr     statement_at
        pshs    a
        ldx     next_statement_be
        beq     source_no_restore
        ldx     statement_delimiter_be
        lda     #':'
        sta     ,x
source_no_restore
        puls    a
        tsta
        lbne    statement_return
        tst     validation_mode
        bne     source_continue
        tst     run_active
        lbeq    statement_ok
        tst     branch_taken
        lbne    statement_ok
source_continue
        ldd     next_statement_be
        lbeq    statement_ok
        std     statement_cursor_be
        bra     source_statement

; GOTO retains variables (unlike RUN). A taken branch skips the remaining
; colon-separated statements on this line and replaces the next record.
goto_statement
        jsr     parse_or
        std     branch_number_be
        jsr     numeric_type_check
        jsr     finish_expression
        tsta
        lbne    statement_return
branch_to_number
        tst     validation_mode
        lbne    statement_ok
        ldd     branch_number_be
        std     edit_number_be
        jsr     resolve_branch
        tsta
        lbne    statement_return
        tst     run_active
        beq     immediate_branch
        stu     run_next_be
        inc     branch_taken
        lbra    statement_ok
resolve_branch
        jsr     find_edit_position
        ldu     record_be
        cmpu    program_end_be
        lbeq    bad_branch
        ldb     1,u
        lda     2,u
        cmpd    edit_number_be
        lbne    bad_branch
        clra
        rts
immediate_branch
        stu     run_record_be
        lbra    run_preserve_variables

; Eight language frames, separate from the CPU stack. Return cursors identify
; a record and rendered-source offset, so rebuilding the source is safe.
gosub_statement
        tst     run_active
        bne     gosub_allowed
        tst     conditional_depth
        lbeq    syntax_error
gosub_allowed
        jsr     parse_or
        std     branch_number_be
        jsr     numeric_type_check
        jsr     finish_expression
        tsta
        lbne    statement_return
        tst     validation_mode
        lbne    statement_ok
        lda     gosub_nest_count
        cmpa    #8
        lbhs    gosub_full
        ; Resolve the target before changing the return stack.
        ldd     branch_number_be
        std     edit_number_be
        jsr     resolve_branch
        tsta
        lbne    statement_return
        stu     gosub_target_be
        ldb     gosub_nest_count
        lslb
        lslb
        ldu     #gosub_frames
        leau    b,u
        tst     run_active
        bne     gosub_program_return
        clr     ,u
        clr     1,u
        clr     2,u
        clr     3,u
        inc     gosub_nest_count
        ldd     gosub_target_be
        std     run_record_be
        lbra    run_preserve_variables
gosub_program_return
        ldd     next_statement_be
        beq     gosub_next_line
        subd    #source_buffer
        std     2,u
        ldd     run_record_be
        bra     gosub_save
gosub_next_line
        clr     2,u
        clr     3,u
        ldx     run_record_be
        clra
        ldb     ,x
        leax    d,x
        tfr     x,d
gosub_save
        std     ,u
        inc     gosub_nest_count
        ldd     gosub_target_be
        std     run_next_be
        inc     branch_taken
        lbra    statement_ok
return_statement
        jsr     skip_spaces
        lda     ,x
        lbne    syntax_error
        tst     run_active
        bne     return_allowed
        tst     conditional_depth
        lbeq    syntax_error
return_allowed
        tst     validation_mode
        lbne    statement_ok
        tst     gosub_nest_count
        lbeq    bad_return
        dec     gosub_nest_count
        ldb     gosub_nest_count
        lslb
        lslb
        ldu     #gosub_frames
        leau    b,u
        ldd     ,u
        beq     return_to_prompt
        std     run_next_be
        ldd     2,u
        std     resume_offset_be
        inc     branch_taken
        lbra    statement_ok
return_to_prompt
        clr     run_active
        lbra    statement_ok
gosub_full
        ldx     #gosub_message
        lbra    report_error
bad_return
        ldx     #return_message
        lbra    report_error

; Numeric names are one letter with an optional single digit, not arbitrary
; multi-letter identifiers. Keep plain A-Z at their established LE locations.
variable_address
        lda     ,x+
        cmpa    #'A'
        blo     variable_invalid
        cmpa    #'Z'
        bhi     variable_invalid
        suba    #'A'
        pshs    a
        jsr     skip_spaces
        puls    a
        ldb     ,x
        cmpb    #'0'
        blo     variable_plain
        cmpb    #'9'
        bhi     variable_plain
        leax    1,x
        subb    #'0'
        pshs    b
        ldb     #10
        mul
        addb    ,s+
        adca    #0
        lslb
        rola
        addd    #variables+52
        tfr     d,u
        stu     variable_key_be
        jsr     skip_spaces
        lda     ,x
        cmpa    #'$'
        beq     variable_invalid
        rts
variable_plain
        lsla
        tfr     a,b
        clra
        addd    #variables
        tfr     d,u
        stu     variable_key_be
        rts
variable_invalid
        ldu     #variables
        lbra    expr_syntax

; FOR frames: variable pointer, limit, step, return record, source offset.
; Frame words are private native BE; language numeric values remain LE.
for_statement
        tst     run_active
        bne     for_allowed
        tst     conditional_depth
        lbeq    syntax_error
for_allowed
        jsr     skip_spaces
        jsr     variable_address
        clr     storage_kind
        jsr     ensure_descriptor
        ldu     7,u
        stu     for_variable_be
        jsr     skip_spaces
        lda     ,x+
        cmpa    #'='
        lbne    syntax_error
        jsr     parse_or
        std     for_initial_be
        jsr     numeric_type_check
        jsr     check_expression_error
        tsta
        lbne    statement_return
        ldu     #kw_to
        jsr     keyword
        lbcc    syntax_error
        jsr     parse_or
        std     for_limit_be
        jsr     numeric_type_check
        jsr     check_expression_error
        tsta
        lbne    statement_return
        ldd     #1
        std     for_step_be
        jsr     numeric_type_check
        ldu     #kw_step
        jsr     keyword
        bcc     for_finish
        jsr     parse_or
        std     for_step_be
for_finish
        jsr     numeric_type_check
        jsr     finish_expression
        tsta
        lbne    statement_return
        tst     validation_mode
        lbne    statement_ok
        lda     for_nest_count
        cmpa    #8
        lbhs    for_full
        ldb     #10
        mul
        ldu     #for_frames
        leau    d,u
        ldd     for_variable_be
        std     ,u
        ldx     for_variable_be
        ldd     for_initial_be
        stb     ,x
        sta     1,x
        ldd     for_limit_be
        std     2,u
        ldd     for_step_be
        std     4,u
        ldd     next_statement_be
        beq     for_next_line
        subd    #source_buffer
        std     8,u
        ldd     run_record_be
        bra     for_save_cursor
for_next_line
        clr     8,u
        clr     9,u
        ldd     run_next_be
for_save_cursor
        std     6,u
        inc     for_nest_count
        lbra    statement_ok
next_statement
        tst     run_active
        bne     next_allowed
        tst     conditional_depth
        lbeq    syntax_error
next_allowed
        jsr     skip_spaces
        jsr     variable_address
        clr     storage_kind
        jsr     ensure_descriptor
        ldu     7,u
        stu     for_variable_be
        jsr     check_expression_error
        tsta
        lbne    statement_return
        jsr     skip_spaces
        stx     next_cursor_be
        lda     ,x
        beq     next_valid_tail
        cmpa    #','
        lbne    syntax_error
next_valid_tail
        tst     validation_mode
        lbne    next_more_items
        lda     for_nest_count
next_search
        tsta
        lbeq    bad_next
        deca
        sta     for_search_count
        ldb     #10
        mul
        ldu     #for_frames
        leau    d,u
        ldd     ,u
        cmpd    for_variable_be
        beq     next_found
        lda     for_search_count
        bra     next_search
next_found
        lda     for_search_count
        inca
        sta     for_nest_count
        ldx     for_variable_be
        ldb     ,x
        lda     1,x
        addd    4,u
        lbvs    range_error
        stb     ,x
        sta     1,x
        subd    2,u
        lbvs    range_error
        tst     4,u
        bmi     next_descending
        cmpd    #0
        bgt     next_complete
        bra     next_repeat
next_descending
        cmpd    #0
        blt     next_complete
next_repeat
        ldd     6,u
        std     run_next_be
        ldd     8,u
        std     resume_offset_be
        inc     branch_taken
        lbra    statement_ok
next_complete
        dec     for_nest_count
next_more_items
        ldx     next_cursor_be
        lda     ,x
        lbeq    statement_ok
        leax    1,x
        lbra    next_statement
bad_next
        ldx     #next_message
        lbra    report_error
for_full
        ldx     #for_message
        lbra    report_error

if_statement
        jsr     parse_or
        std     if_condition_be
        tst     expr_is_string
        beq     if_numeric_condition
        jsr     expr_syntax
if_numeric_condition
        jsr     check_expression_error
        tsta
        lbne    statement_return
        ldu     #kw_then
        jsr     keyword
        lbcc    syntax_error
        tst     validation_mode
        bne     if_validate_consequent
        ldd     if_condition_be
        bne     then_statement
        ; A false IF still requires syntactically valid source. Validate its
        ; consequent with output/writes and runtime arithmetic errors suppressed.
if_validate_consequent
        lda     validation_mode
        ldb     run_active
        pshs    d
        lda     #1
        sta     validation_mode
        sta     run_active
        jsr     then_statement
        pshs    a
        lda     1,s
        sta     validation_mode
        lda     2,s
        sta     run_active
        puls    a
        leas    2,s
        tsta
        lbeq    statement_return
        lda     error_code
        cmpa    #2
        lbeq    range_error
        lbra    syntax_error
then_statement
        inc     conditional_depth
        jsr     then_body
        pshs    a
        dec     conditional_depth
        puls    a,pc
then_body
        jsr     skip_spaces
        lda     ,x
        cmpa    #'0'
        blo     then_command
        cmpa    #'9'
        bhi     then_command
        ; THEN's line-number form is a literal, not GOTO's expression form.
        jsr     parse_integer
        std     branch_number_be
        jsr     finish_expression
        tsta
        lbne    statement_return
        lbra    branch_to_number
then_command
        tsta
        lbeq    syntax_error
        ldu     #kw_end
        jsr     keyword
        bcs     then_end
        lbra    statement_at
then_end
        jsr     skip_spaces
        lda     ,x
        lbne    syntax_error
        tst     validation_mode
        lbne    statement_ok
        clr     run_active
        lbra    statement_ok

kw_list fcc 'LIST'
        fcb 0
kw_auto fcc 'AUTO'
        fcb 0
kw_del fcc 'DEL'
        fcb 0
kw_scr fcc 'SCR'
        fcb 0
kw_run fcc 'RUN'
        fcb 0
kw_end fcc 'END'
        fcb 0
kw_rem fcc 'REM'
        fcb 0
kw_tab fcc 'TAB'
        fcb 0
kw_goto fcc 'GOTO'
        fcb 0
kw_if fcc 'IF'
        fcb 0
kw_then fcc 'THEN'
        fcb 0
kw_for fcc 'FOR'
        fcb 0
kw_to fcc 'TO'
        fcb 0
kw_step fcc 'STEP'
        fcb 0
kw_next fcc 'NEXT'
        fcb 0
kw_gosub fcc 'GOSUB'
        fcb 0
kw_return fcc 'RETURN'
        fcb 0
kw_input fcc 'INPUT'
        fcb 0
kw_dim fcc 'DIM'
        fcb 0
kw_rnd fcc 'RND'
        fcb 0
kw_len fcc 'LEN'
        fcb 0
kw_peek fcc 'PEEK'
        fcb 0
kw_poke fcc 'POKE'
        fcb 0
kw_call fcc 'CALL'
        fcb 0
kw_plot fcc 'PLOT'
        fcb 0
kw_lomem fcc 'LOMEM'
        fcb 0
kw_himem fcc 'HIMEM'
        fcb 0
kw_color fcc 'COLOR'
        fcb 0
; token, format flags (post/pre space, REM, statement), width, pad, word ptr
token_words
        fcb $80,9,5,0
        fdb print_keyword
        fcb $81,9,3,0
        fdb kw_end
        fcb $82,13,3,0
        fdb kw_rem
        fcb $83,9,3,0
        fdb word_let
        fcb $84,9,3,0
        fdb kw_tab
        fcb $85,9,4,0
        fdb kw_goto
        fcb $86,9,2,0
        fdb kw_if
        fcb $87,3,4,0
        fdb kw_then
        fcb $88,9,3,0
        fdb kw_for
        fcb $89,3,2,0
        fdb kw_to
        fcb $8a,3,4,0
        fdb kw_step
        fcb $8b,9,4,0
        fdb kw_next
        fcb $8c,9,5,0
        fdb kw_gosub
        fcb $8d,9,6,0
        fdb kw_return
        fcb $8e,9,5,0
        fdb kw_input
        fcb $8f,9,3,0
        fdb kw_dim
        fcb $90,17,3,0
        fdb word_abs
        fcb $91,17,3,0
        fdb word_sgn
        fcb $92,1,3,0
        fdb word_not
        fcb $93,3,3,0
        fdb word_and
        fcb $94,3,2,0
        fdb word_or
        fcb $95,3,3,0
        fdb word_mod
        fcb $96,17,3,0
        fdb kw_rnd
        fcb $97,16,3,0
        fdb kw_len
        fcb $98,9,3,0
        fdb word_clr
        fcb $99,17,4,0
        fdb kw_peek
        fcb $9a,9,4,0
        fdb kw_poke
        fcb $9b,9,4,0
        fdb kw_call
        fcb $9c,9,4,0
        fdb kw_plot
        fcb $9d,8,5,0
        fdb kw_lomem
        fcb $9e,8,5,0
        fdb kw_himem
        fcb $9f,8,5,0
        fdb kw_color
        fcb 0,0,0,0
        fdb 0
end_message fcc '*** END ERR'
        fcb 13,0
branch_message fcc '*** BAD BRANCH ERR'
        fcb 13,0
gosub_message fcc '*** >8 GOSUBS ERR'
        fcb 13,0
return_message fcc '*** BAD RETURN ERR'
        fcb 13,0
for_message fcc '*** >8 FORS ERR'
        fcb 13,0
next_message fcc '*** BAD NEXT ERR'
        fcb 13,0
memory_message fcc '*** MEM FULL ERR'
        fcb 13,0
stopped_message fcc 'STOPPED AT '
        fcb 0
program_end_be fdb 0
record_be fdb 0
edit_number_be fdb 0
old_length_be fdb 0
new_length_be fdb 0
new_end_be fdb 0
keyword_scan_be fdb 0
sink_cursor_be fdb 0
render_entry_be fdb 0
range_first_be fdb 0
range_last_be fdb 0
run_record_be fdb 0
run_next_be fdb 0
run_number_be fdb 0
statement_cursor_be fdb 0
next_statement_be fdb 0
statement_delimiter_be fdb 0
sink_mode fcb 0
listing_mode fcb 0
validation_mode fcb 0
validation_result fcb 0
run_active fcb 0
branch_taken fcb 0
if_condition_be fdb 0
branch_number_be fdb 0
resume_offset_be fdb 0
gosub_frames rmb 32
gosub_target_be fdb 0
conditional_depth fcb 0
for_frames rmb 80
for_variable_be fdb 0
for_initial_be fdb 0
for_limit_be fdb 0
for_step_be fdb 0
for_search_count fcb 0
next_cursor_be fdb 0
identifier_mode fcb 0
render_string fcb 0
render_rem fcb 0
render_last fcb 0
render_token fcb 0
source_quote fcb 0
list_padding fcb 0
column fcb 1
program_module_end
program_base equ $5000
program_limit equ $7000
token_buffer equ $4800
source_buffer equ $4900

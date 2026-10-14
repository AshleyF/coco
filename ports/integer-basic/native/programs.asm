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
        clr     branch_taken
        clr     listing_mode
        rts
command_line
        ldx     #buffer
        jsr     skip_spaces
        lda     ,x
        cmpa    #'0'
        blo     command_words
        cmpa    #'9'
        lbls    edit_line
command_words
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
        lbra    statement_at
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
        cmpd    #program_limit
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
        bra     render_loop
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
        bra     render_loop
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
        tst     error_code
        bne     range_args_error
        jsr     skip_spaces
        lda     ,x
        cmpa    #','
        bne     range_args_finish
        leax    1,x
        jsr     parse_or
        std     range_last_be
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
        lda     #1
        sta     run_active
run_records
        ldu     run_record_be
        cmpu    program_end_be
        lbeq    run_no_end
        ldb     1,u
        lda     2,u
        std     run_number_be
        clra
        ldb     ,u
        leau    d,u
        stu     run_next_be
        ldx     run_record_be
        leax    3,x
        jsr     render_source
        jsr     execute_source
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
        clr     branch_taken
        ldd     #source_buffer
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
        jsr     finish_expression
        tsta
        lbne    statement_return
branch_to_number
        tst     validation_mode
        lbne    statement_ok
        ldd     branch_number_be
        std     edit_number_be
        jsr     find_edit_position
        ldu     record_be
        cmpu    program_end_be
        lbeq    bad_branch
        ldb     1,u
        lda     2,u
        cmpd    edit_number_be
        lbne    bad_branch
        tst     run_active
        beq     immediate_branch
        stu     run_next_be
        inc     branch_taken
        lbra    statement_ok
immediate_branch
        stu     run_record_be
        lbra    run_preserve_variables

if_statement
        jsr     parse_or
        std     if_condition_be
        jsr     check_expression_error
        tsta
        lbne    statement_return
        ldu     #kw_then
        jsr     keyword
        lbcc    syntax_error
        tst     validation_mode
        bne     then_statement
        ldd     if_condition_be
        bne     then_statement
        ; A false IF still requires syntactically valid source. Validate its
        ; consequent with output/writes and runtime arithmetic errors suppressed.
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
        fcb $90,0,3,0
        fdb word_abs
        fcb $91,0,3,0
        fdb word_sgn
        fcb $92,1,3,0
        fdb word_not
        fcb $93,3,3,0
        fdb word_and
        fcb $94,3,2,0
        fdb word_or
        fcb $95,3,3,0
        fdb word_mod
        fcb $96,0,3,0
        fdb kw_rnd
        fcb $97,0,3,0
        fdb kw_len
        fcb $98,9,3,0
        fdb word_clr
        fcb 0,0,0,0
        fdb 0
end_message fcc '*** END ERR'
        fcb 13,0
branch_message fcc '*** BAD BRANCH ERR'
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
